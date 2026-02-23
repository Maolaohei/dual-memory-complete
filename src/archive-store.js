/**
 * ArchiveStore - 三级存储架构 (Phase 3)
 * 
 * 三级存储:
 * - Active (活跃): 正常查询和更新
 * - Archive (归档): 压缩存储，仅保留摘要
 * - DeepFreeze (冷冻): 仅保留索引，完整内容存档
 */

const fs = require('fs').promises;
const path = require('path');
const { createStore } = require('./index.js');

class ArchiveStore {
  constructor(options = {}) {
    this.workspaceDir = options.workspaceDir || '/root/.openclaw/workspace';
    this.archiveDir = path.join(this.workspaceDir, 'memory/archive/v3');
    this.freezeDir = path.join(this.workspaceDir, 'memory/freeze/v3');
    this.store = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // 确保目录存在
    await fs.mkdir(this.archiveDir, { recursive: true });
    await fs.mkdir(this.freezeDir, { recursive: true });
    
    // 初始化主存储
    this.store = await createStore();
    this.initialized = true;
    
    console.log('📦 ArchiveStore 已初始化');
  }

  /**
   * 降级记忆
   * @param {string} memoryId - 记忆ID
   * @param {string} fromLevel - 当前级别 (P0/P1/P2)
   * @param {string} toLevel - 目标级别 (P1/P2/Archive)
   */
  async demote(memoryId, fromLevel, toLevel) {
    await this.initialize();
    
    console.log(`📉 降级记忆: ${memoryId} (${fromLevel} → ${toLevel})`);
    
    try {
      // 获取原记忆
      const memory = await this.store.getMemory(memoryId);
      if (!memory) {
        console.log(`   ⚠️ 记忆不存在: ${memoryId}`);
        return false;
      }
      
      switch (toLevel) {
        case 'P1':
          return await this._demoteToP1(memory);
        case 'P2':
          return await this._demoteToP2(memory);
        case 'Archive':
          return await this._archive(memory);
        case 'DeepFreeze':
          return await this._freeze(memory);
        default:
          throw new Error(`未知的降级目标: ${toLevel}`);
      }
    } catch (error) {
      console.error(`   ❌ 降级失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 降级到 P1
   */
  async _demoteToP1(memory) {
    // 更新优先级和降级时间
    memory.metadata.priority = 'P1';
    memory.metadata.demoted_at = new Date().toISOString();
    memory.metadata.demoted_from = 'P0';
    
    // 重新保存
    await this._updateMemory(memory);
    console.log(`   ✅ 已降级为 P1`);
    return true;
  }

  /**
   * 降级到 P2
   */
  async _demoteToP2(memory) {
    memory.metadata.priority = 'P2';
    memory.metadata.demoted_at = new Date().toISOString();
    memory.metadata.demoted_from = memory.metadata.demoted_from || 'P1';
    memory.metadata.expires_at = this._getExpiryDate(30); // 30天后过期
    
    await this._updateMemory(memory);
    console.log(`   ✅ 已降级为 P2 (30天有效期)`);
    return true;
  }

  /**
   * 归档存储
   */
  async _archive(memory) {
    // 生成摘要 (保留原内容的20%)
    const summary = this._generateSummary(memory.content);
    
    // 创建归档记录
    const archiveRecord = {
      id: memory.id,
      summary: summary,
      content_hash: this._hashContent(memory.content),
      original_length: memory.content.length,
      summary_length: summary.length,
      metadata: {
        ...memory.metadata,
        archived_at: new Date().toISOString(),
        archived_from: memory.metadata.priority,
        level: 'Archive'
      }
    };
    
    // 保存到归档目录
    const archivePath = path.join(this.archiveDir, `${memory.id}.json`);
    await fs.writeFile(archivePath, JSON.stringify(archiveRecord, null, 2));
    
    // 从主存储中删除完整内容，替换为摘要
    await this.store.deleteMemory(memory.id);
    await this.store.addMemory(summary, {
      ...memory.metadata,
      priority: 'Archive',
      original_id: memory.id,
      is_summary: true
    });
    
    console.log(`   ✅ 已归档 (${memory.content.length} → ${summary.length} 字符)`);
    return true;
  }

  /**
   * 冷冻存储
   */
  async _freeze(memory) {
    // 仅保留索引信息
    const indexRecord = {
      id: memory.id,
      keywords: this._extractKeywords(memory.content),
      content_hash: this._hashContent(memory.content),
      metadata: {
        type: memory.metadata.type,
        topic: memory.metadata.topic,
        created_at: memory.metadata.created_at,
        frozen_at: new Date().toISOString(),
        level: 'DeepFreeze'
      }
    };
    
    // 保存完整内容到冷冻目录
    const freezePath = path.join(this.freezeDir, `${memory.id}.json`);
    await fs.writeFile(freezePath, JSON.stringify({
      ...memory,
      frozen_at: new Date().toISOString()
    }, null, 2));
    
    // 从主存储中删除，只保留索引
    await this.store.deleteMemory(memory.id);
    
    // 可选：保留一个轻量级索引项
    await this.store.addMemory(`[冷冻记忆] ${indexRecord.keywords.join(', ')}`, {
      ...indexRecord.metadata,
      priority: 'DeepFreeze',
      original_id: memory.id,
      is_index: true
    });
    
    console.log(`   ✅ 已冷冻 (仅保留索引)`);
    return true;
  }

  /**
   * 复活解冻
   * @param {string} memoryId - 记忆ID
   * @returns {Promise<Object|null>}
   */
  async thaw(memoryId) {
    await this.initialize();
    
    console.log(`🔥 复活记忆: ${memoryId}`);
    
    // 1. 检查是否在归档中
    const archivePath = path.join(this.archiveDir, `${memoryId}.json`);
    try {
      const archiveData = await fs.readFile(archivePath, 'utf-8');
      const archive = JSON.parse(archiveData);
      
      // 恢复为 P1
      await this.store.addMemory(archive.summary, {
        ...archive.metadata,
        priority: 'P1',
        thawed_at: new Date().toISOString(),
        thawed_from: 'Archive',
        original_content_hash: archive.content_hash
      });
      
      // 删除归档文件
      await fs.unlink(archivePath);
      
      console.log(`   ✅ 已从归档复活为 P1`);
      return { level: 'Archive', content: archive.summary };
    } catch (e) {
      // 不在归档中
    }
    
    // 2. 检查是否在冷冻中
    const freezePath = path.join(this.freezeDir, `${memoryId}.json`);
    try {
      const freezeData = await fs.readFile(freezePath, 'utf-8');
      const frozen = JSON.parse(freezeData);
      
      // 恢复完整内容
      await this.store.addMemory(frozen.content, {
        ...frozen.metadata,
        priority: 'P1',
        thawed_at: new Date().toISOString(),
        thawed_from: 'DeepFreeze'
      });
      
      // 删除冷冻文件
      await fs.unlink(freezePath);
      
      console.log(`   ✅ 已从冷冻复活为 P1`);
      return { level: 'DeepFreeze', content: frozen.content };
    } catch (e) {
      // 不在冷冻中
    }
    
    console.log(`   ⚠️ 记忆未找到: ${memoryId}`);
    return null;
  }

  /**
   * 自动降级检查
   * 根据最后访问时间自动降级
   */
  async autoDemote() {
    await this.initialize();
    
    console.log('🔄 执行自动降级检查...');
    
    const allMemories = await this.store.listMemories(1000);
    const now = new Date();
    let demoted = 0;
    
    for (const memory of allMemories) {
      const lastAccessed = new Date(memory.metadata.last_accessed || memory.metadata.created_at);
      const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);
      
      // P0: 30天未访问 → P1
      if (memory.metadata.priority === 'P0' && daysSinceAccess > 30) {
        await this.demote(memory.id, 'P0', 'P1');
        demoted++;
      }
      // P1: 60天未访问 → Archive
      else if (memory.metadata.priority === 'P1' && daysSinceAccess > 60) {
        await this.demote(memory.id, 'P1', 'Archive');
        demoted++;
      }
      // P2: 过期 → Archive
      else if (memory.metadata.priority === 'P2') {
        const expiresAt = new Date(memory.metadata.expires_at);
        if (now > expiresAt) {
          await this.demote(memory.id, 'P2', 'Archive');
          demoted++;
        }
      }
    }
    
    console.log(`✅ 自动降级完成: ${demoted} 条记忆已降级`);
    return demoted;
  }

  /**
   * 生成摘要 (保留20%内容)
   */
  _generateSummary(content) {
    const sentences = content.split(/[。！？.!?]/);
    const summaryLength = Math.max(1, Math.floor(sentences.length * 0.2));
    return sentences.slice(0, summaryLength).join('。') + '...(已归档)';
  }

  /**
   * 提取关键词
   */
  _extractKeywords(content) {
    // 简单的关键词提取
    const words = content.split(/\s+/);
    const keywords = words.filter(w => w.length > 2).slice(0, 10);
    return keywords;
  }

  /**
   * 计算内容哈希
   */
  _hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 获取过期日期
   */
  _getExpiryDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  /**
   * 更新记忆 (使用基类方法，避免重复)
   */
  async _updateMemory(memory) {
    await this.store.deleteMemory(memory.id);
    await this.store.addMemory(memory.content, memory.metadata);
  }

  /**
   * 获取存储统计
   */
  async getStats() {
    await this.initialize();
    
    const allMemories = await this.store.listMemories(1000);
    
    const stats = {
      active: { P0: 0, P1: 0, P2: 0, total: 0 },
      archive: 0,
      freeze: 0
    };
    
    for (const memory of allMemories) {
      const priority = memory.metadata.priority;
      if (['P0', 'P1', 'P2'].includes(priority)) {
        stats.active[priority]++;
        stats.active.total++;
      } else if (priority === 'Archive') {
        stats.archive++;
      } else if (priority === 'DeepFreeze') {
        stats.freeze++;
      }
    }
    
    return stats;
  }
}

module.exports = { ArchiveStore };
