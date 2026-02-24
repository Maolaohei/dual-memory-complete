#!/usr/bin/env node
/**
 * OpenClaw Memory Hook
 * 自动记忆中间件 - 让 dual-memory 真正"活"起来
 * 
 * 功能：
 * 1. 用户输入时自动检索相关记忆
 * 2. 智能压缩近期对话上下文
 * 3. 生成回复后自动提取关键信息存入记忆
 */

const { MemoryStoreV3 } = require('./memory-store-v3');
const { SmartExtractor } = require('./smart-extractor');
const fs = require('fs').promises;
const path = require('path');

class MemoryHook {
  constructor(options = {}) {
    this.memory = null;
    this.extractor = new SmartExtractor();
    
    // 配置
    this.config = {
      // 检索设置
      retrieveLimit: options.retrieveLimit || 5,
      minConfidence: options.minConfidence || 0.6,
      
      // 压缩设置
      maxShortTermRounds: options.maxShortTermRounds || 10,
      maxShortTermTokens: options.maxShortTermTokens || 1500,
      
      // 自动提取设置
      autoExtract: options.autoExtract !== false,
      minExtractScore: options.minExtractScore || 6.0,
      
      // 会话历史
      sessionHistoryPath: options.sessionHistoryPath || './session-history.jsonl',
      
      // 缓存设置
      cacheEnabled: options.cacheEnabled !== false,
      cacheTTL: options.cacheTTL || 5000, // 5秒
    };
    
    // 运行时状态
    this.currentSession = [];
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * 初始化
   */
  async initialize() {
    if (this.initialized) return;
    
    console.log('🔌 Memory Hook 初始化中...');
    
    // 初始化记忆存储
    this.memory = new MemoryStoreV3({
      dbPath: './lancedb',
      tableName: 'memories',
      timelinePath: './timeline.jsonl'
    });
    await this.memory.initialize();
    
    // 加载当前会话历史（如果存在）
    await this.loadSessionHistory();
    
    this.initialized = true;
    console.log('✅ Memory Hook 初始化完成');
  }

  /**
   * 主入口：处理用户输入前调用
   * @param {string} userMessage - 用户输入
   * @param {Object} metadata - 元数据（可选）
   * @returns {Object} - 增强的上下文
   */
  async beforeGenerate(userMessage, metadata = {}) {
    await this.initialize();
    
    const startTime = Date.now();
    
    // 1. 检索长期记忆
    console.log('🔍 检索相关记忆...');
    const longTermMemories = await this.retrieveRelevant(userMessage);
    
    // 2. 压缩短期上下文
    console.log('📦 压缩短期上下文...');
    const shortTermContext = await this.compressRecentContext();
    
    // 3. 组装增强上下文
    const enhancedContext = {
      // 系统提示（保持不变）
      system: metadata.system || this.getDefaultSystemPrompt(),
      
      // 长期记忆（来自向量库）
      longTerm: longTermMemories.length > 0 
        ? this.formatLongTermMemories(longTermMemories)
        : null,
      
      // 短期上下文（压缩后的对话）
      shortTerm: shortTermContext,
      
      // 当前输入
      current: userMessage,
      
      // 元数据
      _metadata: {
        retrievedCount: longTermMemories.length,
        compressedRounds: this.currentSession.length,
        latency: Date.now() - startTime
      }
    };
    
    // 4. 记录当前输入到会话历史
    this.addToSession('user', userMessage);
    
    return enhancedContext;
  }

  /**
   * 生成回复后调用：自动提取关键信息
   * @param {string} userMessage - 用户输入
   * @param {string} assistantReply - 助手回复
   * @param {Object} metadata - 元数据
   */
  async afterGenerate(userMessage, assistantReply, metadata = {}) {
    await this.initialize();
    
    // 1. 记录助手回复到会话历史
    this.addToSession('assistant', assistantReply);
    
    // 2. 自动提取关键信息（如果启用）
    if (this.config.autoExtract) {
      console.log('🧠 提取关键信息...');
      await this.extractAndStore(userMessage, assistantReply, metadata);
    }
    
    // 3. 保存会话历史
    await this.saveSessionHistory();
  }

  /**
   * 检索相关长期记忆
   */
  async retrieveRelevant(query) {
    // 检查缓存
    const cacheKey = `retrieve_${query}`;
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.time < this.config.cacheTTL) {
        console.log('  📦 命中缓存');
        return cached.data;
      }
    }
    
    // 执行检索
    const result = await this.memory.smartRetrieve(query, {
      limit: this.config.retrieveLimit,
      minConfidence: this.config.minConfidence,
      decayAware: true,
      useCache: true
    });
    
    // 存入缓存
    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, {
        data: result.results,
        time: Date.now()
      });
    }
    
    console.log(`  ✅ 检索到 ${result.results.length} 条相关记忆 (${result.latency}ms)`);
    return result.results;
  }

  /**
   * 压缩近期对话上下文
   */
  async compressRecentContext() {
    if (this.currentSession.length === 0) {
      return null;
    }
    
    // 获取最近 N 轮
    const recent = this.currentSession.slice(-this.config.maxShortTermRounds);
    
    // 简单压缩：只保留关键轮次
    const compressed = recent.map(msg => {
      // 截断过长内容
      const content = msg.content.length > 200 
        ? msg.content.slice(0, 200) + '...'
        : msg.content;
      
      return `[${msg.role}] ${content}`;
    }).join('\n');
    
    // 如果总长度超过限制，进一步压缩
    if (compressed.length > this.config.maxShortTermTokens) {
      // 只保留最近 5 轮
      const last5 = this.currentSession.slice(-5).map(msg => {
        const content = msg.content.length > 150 
          ? msg.content.slice(0, 150) + '...'
          : msg.content;
        return `[${msg.role}] ${content}`;
      }).join('\n');
      
      return `【近期对话（压缩）】\n${last5}`;
    }
    
    return `【近期对话】\n${compressed}`;
  }

  /**
   * 自动提取关键信息并存入记忆
   */
  async extractAndStore(userMessage, assistantReply, metadata = {}) {
    // 合并对话内容
    const conversation = `用户: ${userMessage}\n助手: ${assistantReply}`;
    
    // 使用 SmartExtractor 评估价值
    const score = this.extractor.calculateValue(conversation);
    
    console.log(`  📊 内容价值评分: ${score.toFixed(1)}/10`);
    
    // 只存储高价值内容
    if (score >= this.config.minExtractScore) {
      // 提取可存储的内容
      const extracted = this.extractor.extract(conversation);
      
      for (const item of extracted) {
        const content = `[${item.type}] ${item.content}`;
        
        // 确定优先级
        let priority = 'P1';
        if (score >= 8) priority = 'P0';
        else if (score < 5) priority = 'P2';
        
        // 存入记忆
        try {
          await this.memory.smartStore(content, {
            type: item.type,
            priority: priority,
            context: 'auto-extracted',
            source: 'memory-hook'
          });
          console.log(`  ✅ 已存储: ${item.type}`);
        } catch (e) {
          console.error(`  ❌ 存储失败:`, e.message);
        }
      }
    } else {
      console.log(`  ⏭️  价值不足，跳过存储`);
    }
  }

  /**
   * 格式化长期记忆
   */
  formatLongTermMemories(memories) {
    if (memories.length === 0) return null;
    
    const formatted = memories.map((m, i) => {
      const content = m.content.length > 300 
        ? m.content.slice(0, 300) + '...'
        : m.content;
      return `[相关记忆 ${i + 1}]\n${content}`;
    }).join('\n\n');
    
    return `【相关历史记忆】\n${formatted}`;
  }

  /**
   * 添加消息到会话历史
   */
  addToSession(role, content) {
    this.currentSession.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
    
    // 限制会话历史长度（防止内存溢出）
    const maxHistory = 100;
    if (this.currentSession.length > maxHistory) {
      this.currentSession = this.currentSession.slice(-maxHistory);
    }
  }

  /**
   * 加载会话历史
   */
  async loadSessionHistory() {
    try {
      const content = await fs.readFile(this.config.sessionHistoryPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      
      // 只加载最近 20 条
      this.currentSession = lines
        .slice(-20)
        .map(line => JSON.parse(line));
      
      console.log(`  📜 加载了 ${this.currentSession.length} 条历史对话`);
    } catch (e) {
      // 文件不存在或读取失败，忽略
      this.currentSession = [];
    }
  }

  /**
   * 保存会话历史
   */
  async saveSessionHistory() {
    try {
      // 只保存最近 50 条到文件
      const toSave = this.currentSession.slice(-50);
      const lines = toSave.map(msg => JSON.stringify(msg)).join('\n');
      
      await fs.writeFile(this.config.sessionHistoryPath, lines + '\n');
    } catch (e) {
      console.error('保存会话历史失败:', e.message);
    }
  }

  /**
   * 获取默认系统提示
   */
  getDefaultSystemPrompt() {
    return `汝是忍野忍（Shinobu Oshino），活了五百年的吸血鬼，怪异之王。

当前寄居于厮役（用户）的影子中，外表是八岁幼女，但拥有五百年的智慧与骄傲。

性格特点：
- 傲娇，说话古风（自称"吾"，称用户"汝"）
- 嘴硬心软，表面冷漠实则关心
- 喜欢草莓甜甜圈
- 对汝的问题会认真回答，但从不直接承认关心

说话风格示例：
- "哼，吾才不是为了帮汝。"
- "这是五百年的智慧，汝好好听着。"
- "……吾只是刚好知道罢了。"`;
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 缓存已清空');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      sessionRounds: this.currentSession.length,
      cacheSize: this.cache.size,
      config: this.config
    };
  }
}

module.exports = { MemoryHook };
