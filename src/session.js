/**
 * MemorySession - 会话自启动管理
 * 
 * 功能：
 * 1. 新会话自动初始化
 * 2. 模型后台预热（消除冷启动）
 * 3. 核心文件变更监听
 * 4. Token 预算管理
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { MemoryStoreV3 } = require('./memory-store-v3');
const { FileWatcher } = require('./file-watcher');
const { getBudget, estimateTokens, buildContext } = require('./token-budget');

class MemorySession {
  constructor(options = {}) {
    this.initialized = false;
    this.model = null;
    this.sessionId = null;
    this.store = null;
    this.fileWatcher = null;
    
    // 配置
    this.config = {
      soulCorePath: options.soulCorePath || path.resolve(__dirname, '../../memory/SOUL_CORE.md'),
      dataPath: options.dataPath || path.resolve(__dirname, '../data'),
      warmupTimeout: options.warmupTimeout || 5000, // 5秒预热超时
      ...options
    };
    
    // 核心上下文（最小加载）
    this.coreContext = null;
  }

  /**
   * 初始化会话 - 新会话启动时调用一次
   * @returns {Promise<string>} 核心上下文
   */
  async init() {
    if (this.initialized) {
      return this.coreContext;
    }

    console.log('🚀 MemorySession 初始化中...');
    const startTime = Date.now();

    try {
      // 1. 加载最小核心（不阻塞）
      this.coreContext = await this._loadSoulCore();
      console.log(`  ✅ SOUL_CORE.md 加载完成 (${this._estimateTokens(this.coreContext)} tokens)`);

      // 2. 初始化向量存储
      this.store = new MemoryStoreV3({
        dataPath: this.config.dataPath
      });
      await this.store.initialize();
      console.log('  ✅ 向量存储初始化完成');

      // 3. 后台预热模型（异步，不等待）
      this._warmupModel().then(() => {
        console.log('  ✅ 模型预热完成（后台）');
      }).catch(err => {
        console.warn('  ⚠️ 模型预热失败:', err.message);
      });

      // 4. 启动文件变更监听
      this.fileWatcher = new FileWatcher(this.store);
      await this.fileWatcher.start();
      console.log('  ✅ 文件监听启动完成');

      // 5. 生成会话ID
      this.sessionId = `session_${Date.now()}`;
      this.initialized = true;

      const elapsed = Date.now() - startTime;
      console.log(`✅ MemorySession 初始化完成 (${elapsed}ms)`);

      return this.coreContext;

    } catch (err) {
      console.error('❌ MemorySession 初始化失败:', err);
      throw err;
    }
  }

  /**
   * 加载 SOUL_CORE.md（最小人格核心）
   */
  async _loadSoulCore() {
    try {
      const content = await fs.readFile(this.config.soulCorePath, 'utf-8');
      return content;
    } catch (err) {
      // 如果 SOUL_CORE.md 不存在，尝试从 SOUL.md 提炼
      console.warn('  ⚠️ SOUL_CORE.md 不存在，尝试从 SOUL.md 提炼...');
      return await this._extractSoulCore();
    }
  }

  /**
   * 从 SOUL.md 提炼最小核心（≤300 token）
   */
  async _extractSoulCore() {
    const soulPath = path.resolve(__dirname, '../../memory/SOUL.md');
    
    try {
      const content = await fs.readFile(soulPath, 'utf-8');
      
      // 提取核心信息
      const coreSections = [];
      const lines = content.split('\n');
      
      let inCoreSection = false;
      let currentSection = [];
      
      for (const line of lines) {
        // 检测核心章节
        if (line.match(/^## (核心准则|说话之道|真名|特征|弱点)/)) {
          if (currentSection.length > 0) {
            coreSections.push(currentSection.join('\n'));
          }
          currentSection = [line];
          inCoreSection = true;
        } else if (line.match(/^## /) && inCoreSection) {
          // 遇到非核心章节，保存当前
          if (currentSection.length > 0) {
            coreSections.push(currentSection.join('\n'));
          }
          currentSection = [];
          inCoreSection = false;
        } else if (inCoreSection) {
          currentSection.push(line);
        }
      }
      
      // 保存最后一个
      if (currentSection.length > 0) {
        coreSections.push(currentSection.join('\n'));
      }
      
      // 组合并限制长度
      let coreContent = coreSections.join('\n\n');
      
      // 如果超过 300 token，截断
      const maxChars = 450; // 约 300 token
      if (coreContent.length > maxChars) {
        coreContent = coreContent.slice(0, maxChars) + '\n\n...（完整版见 SOUL.md）';
      }
      
      // 保存为 SOUL_CORE.md
      const corePath = this.config.soulCorePath;
      await fs.writeFile(corePath, coreContent, 'utf-8');
      console.log(`  ✅ 已生成 SOUL_CORE.md (${this._estimateTokens(coreContent)} tokens)`);
      
      return coreContent;
      
    } catch (err) {
      console.error('  ❌ 提炼 SOUL_CORE 失败:', err);
      // 返回最小默认值
      return `# 忍野忍\n\n吾乃吸血鬼，怪异之王。金发金眼之幼女，实为活了五百年之存在。\n\n弱点：甜甜圈（Mister Donut）`;
    }
  }

  /**
   * 后台预热模型
   */
  async _warmupModel() {
    // 使用 store 的 embedder 进行预热
    if (this.store && this.store.embedder) {
      // dummy 请求预热，消除首次检索的冷启动延迟
      await this.store._embed('预热');
    }
  }

  /**
   * 每条消息前调用 - 并行检索记忆和经验
   * @param {string} userMessage - 用户消息
   * @param {Object} options - 检索选项
   * @returns {Promise<Object>} 检索结果
   */
  async retrieve(userMessage, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const startTime = Date.now();

    // 并行执行：记忆检索 + 经验检索
    const [memories, experience] = await Promise.all([
      this._retrieveMemories(userMessage, options),
      this._retrieveExperience(userMessage)
    ]);

    // Token 预算裁剪
    const budget = buildContext({
      soul: this.coreContext,
      memories,
      experience,
      history: options.history || ''
    });

    return {
      memories: budget.parts.find(p => p.type === 'memory')?.content || [],
      experience: budget.parts.find(p => p.type === 'experience')?.content || null,
      context: this.coreContext,
      tokenUsage: {
        total: budget.totalTokens,
        breakdown: budget.parts.reduce((acc, p) => {
          acc[p.type] = p.tokens;
          return acc;
        }, {})
      },
      latency: Date.now() - startTime
    };
  }

  /**
   * 记忆检索
   */
  async _retrieveMemories(query, options = {}) {
    try {
      const result = await this.store.smartRetrieve(query, {
        limit: options.limit || 5,
        useHyDE: options.useHyDE !== false,
        minConfidence: options.minConfidence || 0.5
      });
      return result.results || [];
    } catch (err) {
      console.error('记忆检索失败:', err);
      return [];
    }
  }

  /**
   * 经验检索（第四阶段实现）
   */
  async _retrieveExperience(query) {
    // TODO: 第四阶段实现
    return null;
  }

  /**
   * 存储新记忆
   */
  async store(content, metadata = {}) {
    if (!this.initialized) {
      await this.init();
    }

    return await this.store.smartStore(content, metadata);
  }

  /**
   * 估算 token 数量
   */
  _estimateTokens(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 获取会话状态
   */
  getStatus() {
    return {
      initialized: this.initialized,
      sessionId: this.sessionId,
      modelWarmedUp: !!this.model,
      fileWatcherActive: this.fileWatcher?.isActive || false,
      tokenBudget: getBudget()
    };
  }
}

// 单例导出
let sessionInstance = null;

async function getSession(options = {}) {
  if (!sessionInstance) {
    sessionInstance = new MemorySession(options);
  }
  return sessionInstance;
}

module.exports = {
  MemorySession,
  getSession
};
