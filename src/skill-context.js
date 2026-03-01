/**
 * SkillContext - Skill 作用域管理 v6.0
 * 
 * 问题20解决方案：Skill 用完后仍赖在上下文里污染后续对话
 * 问题26解决方案：SkillContext 是内存状态，重启后丢失
 * 
 * 功能：
 * 1. TTL 生命周期管理
 * 2. 话题切换检测
 * 3. 持久化到文件
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class SkillContext {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.persistFile = path.resolve(__dirname, `../data/sessions/${sessionId}_skills.json`);
    this.activeSkills = new Map();
    
    // 配置
    this.config = {
      defaultTTL: options.defaultTTL || 2,
      topicSwitchThreshold: options.topicSwitchThreshold || 0.3,
      persistOnChange: options.persistOnChange !== false
    };
    
    // 嵌入函数（用于话题检测）
    this._embedFn = options.embedFn || null;
  }

  /**
   * 加载 Skill，设置生命周期
   */
  async load(skillName, ttl = null) {
    const actualTTL = ttl !== null ? ttl : this.config.defaultTTL;
    
    this.activeSkills.set(skillName, {
      loadedAt: Date.now(),
      ttl: actualTTL,
      usedCount: 0
    });
    
    console.log(`[SkillContext] 加载：${skillName}，TTL=${actualTTL}`);
    
    if (this.config.persistOnChange) {
      await this._persist();
    }
  }

  /**
   * 每轮对话结束后调用，TTL 倒计时
   */
  async tick() {
    const toRemove = [];
    
    for (const [name, meta] of this.activeSkills) {
      meta.ttl -= 1;
      if (meta.ttl <= 0) {
        toRemove.push(name);
      }
    }
    
    for (const name of toRemove) {
      this.activeSkills.delete(name);
      console.log(`[SkillContext] 自动卸载：${name}`);
    }
    
    if (this.config.persistOnChange) {
      await this._persist();
    }
  }

  /**
   * 强制清空（话题切换时调用）
   */
  async clear() {
    const names = [...this.activeSkills.keys()];
    this.activeSkills.clear();
    
    if (names.length > 0) {
      console.log(`[SkillContext] 话题切换，清空：${names.join(', ')}`);
    }
    
    if (this.config.persistOnChange) {
      await this._persist();
    }
  }

  /**
   * 重置某个 Skill 的 TTL（用户说"继续"时）
   */
  async resetTTL(skillName, ttl = null) {
    const meta = this.activeSkills.get(skillName);
    if (meta) {
      meta.ttl = ttl !== null ? ttl : this.config.defaultTTL;
      console.log(`[SkillContext] 重置 TTL：${skillName} → ${meta.ttl}`);
      
      if (this.config.persistOnChange) {
        await this._persist();
      }
    }
  }

  /**
   * 获取当前有效的 Skill 列表
   */
  getActiveSkills() {
    return [...this.activeSkills.keys()];
  }

  /**
   * 检查某个 Skill 是否活跃
   */
  isActive(skillName) {
    return this.activeSkills.has(skillName);
  }

  /**
   * 获取某个 Skill 的元数据
   */
  getMeta(skillName) {
    return this.activeSkills.get(skillName);
  }

  /**
   * 持久化到文件
   */
  async _persist() {
    // 确保目录存在
    const dir = path.dirname(this.persistFile);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    const data = Object.fromEntries(this.activeSkills);
    data._sessionId = this.sessionId;
    data._persistedAt = new Date().toISOString();
    
    await fs.writeFile(this.persistFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 从文件恢复状态
   */
  async restore() {
    try {
      if (!fsSync.existsSync(this.persistFile)) {
        return;
      }
      
      const data = JSON.parse(await fs.readFile(this.persistFile, 'utf-8'));
      
      for (const [name, meta] of Object.entries(data)) {
        if (name.startsWith('_')) continue; // 跳过元数据字段
        
        // 只恢复 TTL 还有剩余的 Skill
        if (meta.ttl > 0) {
          this.activeSkills.set(name, meta);
        }
      }
      
      if (this.activeSkills.size > 0) {
        console.log(`[SkillContext] 已恢复 ${this.activeSkills.size} 个 Skill 状态`);
      }
    } catch (err) {
      console.warn(`[SkillContext] 恢复失败:`, err.message);
    }
  }

  /**
   * 检测话题切换
   * @param {string} prevMessage - 上一条消息
   * @param {string} newMessage - 当前消息
   * @returns {Promise<boolean>} - 是否切换了话题
   */
  async detectTopicSwitch(prevMessage, newMessage) {
    if (!prevMessage || !this._embedFn) {
      return false;
    }
    
    try {
      const prevVec = await this._embedFn(prevMessage);
      const newVec = await this._embedFn(newMessage);
      
      const similarity = this._cosineSimilarity(prevVec, newVec);
      
      // 相似度低于阈值，认为切换了话题
      if (similarity < this.config.topicSwitchThreshold) {
        await this.clear();
        return true;
      }
      
      return false;
    } catch (err) {
      console.warn(`[SkillContext] 话题检测失败:`, err.message);
      return false;
    }
  }

  /**
   * 计算余弦相似度
   */
  _cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 获取状态摘要
   */
  getSummary() {
    const skills = this.getActiveSkills();
    return {
      sessionId: this.sessionId,
      activeCount: skills.length,
      skills: skills.map(name => {
        const meta = this.getMeta(name);
        return {
          name,
          ttl: meta.ttl,
          usedCount: meta.usedCount
        };
      })
    };
  }
}

module.exports = { SkillContext };