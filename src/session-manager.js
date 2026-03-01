/**
 * SessionManager - 多会话并发保护 v6.0
 * 
 * 问题23解决方案：多会话并发冲突，无锁机制
 * 
 * 功能：
 * 1. 每个会话独立 ID
 * 2. 独立的摘要文件
 * 3. 独立的 SkillContext
 * 4. 会话结束时合并到全局历史
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { SkillContext } = require('./skill-context');

class SessionManager {
  constructor(options = {}) {
    // 每个会话有独立 ID
    this.sessionId = options.sessionId || randomUUID();
    this.createdAt = new Date().toISOString();
    
    // 目录配置
    this.baseDir = options.baseDir || path.resolve(__dirname, '../data/sessions');
    this.historyFile = options.historyFile || path.resolve(__dirname, '../../memory/HISTORY.md');
    
    // 会话文件
    this.summaryFile = path.join(this.baseDir, `${this.sessionId}.md`);
    this.logFile = path.join(this.baseDir, `${this.sessionId}.log`);
    
    // 独立的 SkillContext
    this.skillContext = new SkillContext(this.sessionId, options.skillContext);
    
    // 会话状态
    this.messageCount = 0;
    this.tokenUsage = 0;
    this.tasks = [];
  }

  /**
   * 初始化会话
   */
  async initialize() {
    // 确保目录存在
    if (!fsSync.existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
    
    // 恢复 SkillContext 状态
    await this.skillContext.restore();
    
    // 写入会话开始标记
    const header = `# Session ${this.sessionId}\n开始时间: ${this.createdAt}\n\n`;
    await fs.writeFile(this.summaryFile, header, 'utf-8');
    
    console.log(`[Session] 会话初始化: ${this.sessionId}`);
    
    return this;
  }

  /**
   * 记录消息
   */
  async recordMessage(role, content, tokens = 0) {
    this.messageCount++;
    this.tokenUsage += tokens;
    
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${role}: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}\n`;
    
    await fs.appendFile(this.logFile, line, 'utf-8');
  }

  /**
   * 记录任务
   */
  recordTask(taskId, taskType, status) {
    this.tasks.push({
      taskId,
      taskType,
      status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 保存摘要
   */
  async saveSummary(content) {
    await fs.writeFile(this.summaryFile, content, 'utf-8');
  }

  /**
   * 追加到摘要
   */
  async appendSummary(content) {
    await fs.appendFile(this.summaryFile, content + '\n', 'utf-8');
  }

  /**
   * 获取 SkillContext
   */
  getSkillContext() {
    return this.skillContext;
  }

  /**
   * 会话结束，清理并归档
   */
  async cleanup() {
    const endTime = new Date().toISOString();
    const duration = (new Date(endTime) - new Date(this.createdAt)) / 1000;
    
    // 生成会话摘要
    const summary = `
## Session ${this.sessionId}
- 开始: ${this.createdAt}
- 结束: ${endTime}
- 时长: ${Math.round(duration)}秒
- 消息数: ${this.messageCount}
- Token消耗: ${this.tokenUsage}
- 任务数: ${this.tasks.length}
- 成功: ${this.tasks.filter(t => t.status === 'success').length}
- 失败: ${this.tasks.filter(t => t.status === 'failed').length}

`;
    
    // 合并到全局历史
    await fs.appendFile(this.historyFile, summary, 'utf-8');
    
    // 清理临时文件
    try {
      if (fsSync.existsSync(this.summaryFile)) {
        await fs.unlink(this.summaryFile);
      }
      if (fsSync.existsSync(this.logFile)) {
        await fs.unlink(this.logFile);
      }
      // 清理 SkillContext 持久化文件
      const skillFile = path.join(this.baseDir, `${this.sessionId}_skills.json`);
      if (fsSync.existsSync(skillFile)) {
        await fs.unlink(skillFile);
      }
    } catch (err) {
      // 忽略清理错误
    }
    
    console.log(`[Session] 会话结束: ${this.sessionId}`);
  }

  /**
   * 获取会话状态
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      messageCount: this.messageCount,
      tokenUsage: this.tokenUsage,
      tasksCount: this.tasks.length,
      activeSkills: this.skillContext.getActiveSkills()
    };
  }

  /**
   * 静态方法：创建新会话
   */
  static async create(options = {}) {
    const session = new SessionManager(options);
    await session.initialize();
    return session;
  }

  /**
   * 静态方法：恢复会话
   */
  static async restore(sessionId, options = {}) {
    const session = new SessionManager({ ...options, sessionId });
    await session.skillContext.restore();
    return session;
  }

  /**
   * 静态方法：列出所有活跃会话
   */
  static listActive(baseDir) {
    const dir = baseDir || path.resolve(__dirname, '../data/sessions');
    
    if (!fsSync.existsSync(dir)) {
      return [];
    }
    
    return fsSync.readdirSync(dir)
      .filter(f => f.endsWith('.md') || f.endsWith('_skills.json'))
      .map(f => {
        const match = f.match(/^([a-f0-9-]+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i); // 去重
  }
}

module.exports = { SessionManager };