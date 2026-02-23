/**
 * Enhanced MemoryStore - 增强版记忆存储
 * 支持复杂过滤和删除操作
 */

const { MemoryStore } = require('./memory-store');
const lancedb = require('vectordb');

class EnhancedMemoryStore extends MemoryStore {
  /**
   * 根据元数据过滤搜索
   * @param {string} query - 查询文本
   * @param {Object} filters - 过滤条件 {type: 'preference', topic: 'food'}
   * @param {number} nResults - 结果数量
   * @returns {Array}
   */
  async searchWithFilter(query, filters = {}, nResults = 5) {
    await this.initialize();

    // 生成查询向量
    const queryVector = await this._embed(query);

    // 构建过滤条件
    let whereClause = null;
    if (Object.keys(filters).length > 0) {
      whereClause = Object.entries(filters)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key} = '${value.replace(/'/g, "\\'")}'`;
          }
          return `${key} = ${value}`;
        })
        .join(' AND ');
    }

    // 执行搜索
    let searchQuery = this.table.search(queryVector);
    
    if (whereClause) {
      searchQuery = searchQuery.where(whereClause);
    }
    
    const results = await searchQuery.limit(nResults).execute();

    // 格式化结果
    return results.map(r => ({
      id: r.id,
      content: r.content,
      metadata: {
        type: r.type || '',
        topic: r.topic || '',
        character: r.character || '',
        priority: r.priority || '',
        date: r.date || '',
        created_at: r.created_at || ''
      }
    }));
  }

  /**
   * 根据 ID 删除记忆
   * 优化：使用 LanceDB 原生删除方法，不再重建表
   * @param {string} id - 记忆ID
   */
  async deleteMemory(id) {
    await this.initialize();
    
    // 使用原生 delete 方法
    await this.table.delete(`id = '${id.replace(/'/g, "\\'")}'`);
    
    console.log(`✅ 已删除记忆 ${id}`);
  }

  /**
   * 更新元数据
   * 优化：采用读取-修改-原生删除-重插逻辑（暂不使用 SDK 不稳定的 update）
   * @param {string} id - 记忆ID
   * @param {Object} updates - 更新的字段
   */
  async updateMetadata(id, updates) {
    await this.initialize();
    
    // 1. 获取现有记录
    const results = await this.table.filter(`id = '${id}'`).limit(1).execute();
    if (results.length === 0) throw new Error(`记忆 ${id} 不存在`);
    const oldData = results[0];
    
    // 2. 合并数据 (注意保留 vector)
    const newData = { ...oldData, ...updates, updated_at: new Date().toISOString() };
    
    // 3. 原生删除旧记录
    await this.table.delete(`id = '${id}'`);
    
    // 4. 插入新记录
    await this.table.add([newData]);
    
    return true;
  }

  /**
   * 更新记忆内容
   * @param {string} id - 记忆ID
   * @param {string} newContent - 新内容
   * @param {Object} newMetadata - 新元数据
   */
  async updateMemory(id, newContent, newMetadata = {}) {
    await this.initialize();
    
    // 先删除旧记录
    await this.deleteMemory(id);
    
    // 添加新记录（保留原ID）
    const vector = await this._embed(newContent);
    
    const data = {
      id: id,
      content: newContent,
      vector: vector,
      type: newMetadata.type || '',
      topic: newMetadata.topic || '',
      character: newMetadata.character || '',
      priority: newMetadata.priority || '',
      date: newMetadata.date || new Date().toISOString().slice(0, 10),
      created_at: newMetadata.created_at || new Date().toISOString()
    };
    
    await this.table.add([data]);
    
    console.log(`✅ 已更新记忆 ${id}`);
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  async getStats() {
    await this.initialize();
    
    const count = await this.count();
    const all = await this.listMemories(1000);
    
    // 按类型统计
    const byType = {};
    all.forEach(m => {
      const type = m.metadata.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });
    
    // 按主题统计
    const byTopic = {};
    all.forEach(m => {
      const topic = m.metadata.topic || 'unknown';
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    });
    
    return {
      total: count,
      by_type: byType,
      by_topic: byTopic
    };
  }
}

module.exports = { EnhancedMemoryStore };
