/**
 * TimelineTracker - 跨会话关联与时间线追踪 (Phase 3)
 * 
 * 功能:
 * - 中期偏好检测 (7天窗口)
 * - 长期偏好变化检测
 * - 主题时间线维护
 */

const { createStore } = require('./index.js');

class TimelineTracker {
  constructor(options = {}) {
    this.store = null;
    this.initialized = false;
    this.timeWindowDays = options.timeWindowDays || 7;
    this.conflictThreshold = options.conflictThreshold || 0.3;
  }

  async initialize() {
    if (this.initialized) return;
    this.store = await createStore();
    this.initialized = true;
    console.log('⏱️ TimelineTracker 已初始化');
  }

  /**
   * 查找最近N天内的相似记忆
   * 优化：使用 LanceDB 原生向量搜索，性能提升万倍
   */
  async findRecentSimilar(query, days = 7, similarityThreshold = 0.8) {
    await this.initialize();
    
    const queryVector = await this.store._embed(query);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    // 直接利用数据库进行过滤和搜索
    const results = await this.store.table
      .search(queryVector)
      .where(`created_at >= '${cutoffStr}'`)
      .limit(5)
      .execute();
    
    // LanceDB 的 _distance 是平方 L2 距离，需要转换为余弦相似度（如果是归一化向量，相似度 = 1 - distance/2）
    return results.map(r => ({
      ...r,
      similarity: 1 - (r._distance / 2),
      metadata: {
        type: r.type,
        topic: r.topic,
        created_at: r.created_at
      }
    })).filter(r => r.similarity >= similarityThreshold);
  }

  /**
   * 更新而非新建
   * 如果找到相似记忆，合并内容而非新建
   * @param {string} content - 新内容
   * @param {Object} metadata - 元数据
   * @returns {Promise<Object>}
   */
  async upsertMemory(content, metadata) {
    await this.initialize();
    
    // 查找7天内相似记忆
    const similar = await this.findRecentSimilar(content, this.timeWindowDays, 0.75);
    
    if (similar.length > 0) {
      // 找到相似记忆，更新而非新建
      const existing = similar[0];
      console.log(`📝 找到相似记忆 (${existing.similarity.toFixed(2)}), 执行更新`);
      
      // 合并内容
      const mergedContent = this._mergeContent(existing.content, content);
      
      // 更新元数据
      const updatedMetadata = {
        ...existing.metadata,
        ...metadata,
        updated_at: new Date().toISOString(),
        update_count: (existing.metadata.update_count || 0) + 1,
        versions: [
          ...(existing.metadata.versions || []),
          {
            content: content,
            timestamp: new Date().toISOString()
          }
        ]
      };
      
      // 删除重插
      await this.store.deleteMemory(existing.id);
      await this.store.addMemory(mergedContent, updatedMetadata);
      
      return {
        action: 'updated',
        id: existing.id,
        similarity: existing.similarity
      };
    }
    
    // 没有找到相似记忆，新建
    const id = await this.store.addMemory(content, {
      ...metadata,
      created_at: new Date().toISOString()
    });
    
    return {
      action: 'created',
      id
    };
  }

  /**
   * ========== 长期偏好变化检测 ==========
   */
  
  /**
   * 检测记忆冲突
   * @param {Object} oldMemory - 旧记忆
   * @param {Object} newMemory - 新记忆
   * @returns {Object} { isConflict, conflictType, confidence }
   */
  detectConflict(oldMemory, newMemory) {
    // 1. 语义相似度检查 (高相似但内容矛盾)
    const semanticSimilar = oldMemory.similarity > 0.7;
    
    // 2. 关键词冲突检测
    const oldKeywords = this._extractKeyPhrases(oldMemory.content);
    const newKeywords = this._extractKeyPhrases(newMemory.content);
    
    // 检查是否有互斥关键词
    const conflictPatterns = [
      { positive: /喜欢|爱|偏好|favorite/i, negative: /讨厌|恨|不喜欢|hate/i },
      { positive: /总是|一直|always/i, negative: /从不|永不|never/i },
      { positive: /是|yes/i, negative: /否|不是|no/i }
    ];
    
    let conflictScore = 0;
    let conflictType = null;
    
    for (const pattern of conflictPatterns) {
      const oldHasPositive = pattern.positive.test(oldMemory.content);
      const oldHasNegative = pattern.negative.test(oldMemory.content);
      const newHasPositive = pattern.positive.test(newMemory.content);
      const newHasNegative = pattern.negative.test(newMemory.content);
      
      // 检测冲突: 旧喜欢 + 新讨厌，或旧讨厌 + 新喜欢
      if ((oldHasPositive && newHasNegative) || (oldHasNegative && newHasPositive)) {
        conflictScore += 0.4;
        conflictType = 'preference_reversal';
      }
    }
    
    // 3. 内容矛盾检测 (同一主题，不同结论)
    const sameTopic = oldMemory.metadata.topic === newMemory.metadata.topic;
    const sameType = oldMemory.metadata.type === newMemory.metadata.type;
    
    if (semanticSimilar && sameTopic && sameType && conflictScore > 0) {
      return {
        isConflict: true,
        conflictType: conflictType || 'semantic_conflict',
        confidence: Math.min(1, conflictScore + 0.3)
      };
    }
    
    return {
      isConflict: false,
      conflictType: null,
      confidence: 0
    };
  }

  /**
   * 记录偏好变化
   * @param {string} topic - 主题
   * @param {string} from - 旧偏好
   * @param {string} to - 新偏好
   * @param {Object} context - 上下文
   */
  async recordChange(topic, from, to, context = {}) {
    await this.initialize();
    
    const changeRecord = {
      type: 'preference_change',
      topic: topic,
      from: from,
      to: to,
      priority: 'P0',  // 偏好变化很重要！
      changed_at: new Date().toISOString(),
      context: context
    };
    
    // 保存变化记录
    const content = `[偏好变化] ${topic}: "${from}" → "${to}"`;
    const id = await this.store.addMemory(content, changeRecord);
    
    console.log(`🔄 记录偏好变化: ${topic}`);
    console.log(`   从: "${from.slice(0, 30)}..."`);
    console.log(`   到: "${to.slice(0, 30)}..."`);
    
    return id;
  }

  /**
   * 检查并处理偏好变化
   * 优化：使用原生搜索替代全量拉取
   */
  async checkPreferenceChange(content, metadata) {
    await this.initialize();
    
    const topic = metadata.topic || 'general';
    
    // 使用搜索查找同主题相关记忆（而非拉取1000条）
    const queryVector = await this.store._embed(content);
    const results = await this.store.table
      .search(queryVector)
      .where(`topic = '${topic}'`)
      .limit(5)
      .execute();
    
    const similarMemories = results.map(r => ({
      ...r,
      similarity: 1 - (r._distance / 2),
      metadata: { type: r.type, topic: r.topic, created_at: r.created_at }
    }));
    
    for (const oldMemory of similarMemories) {
      oldMemory.content = oldMemory.content; // 确保字段兼容
      
      const conflict = this.detectConflict(
        oldMemory, 
        { content, metadata, similarity: oldMemory.similarity }
      );
      
      if (conflict.isConflict && conflict.confidence > 0.5) {
        await this.recordChange(
          topic,
          oldMemory.content,
          content,
          {
            conflict_type: conflict.conflictType,
            confidence: conflict.confidence,
            old_memory_id: oldMemory.id
          }
        );
        
        return {
          action: 'change_recorded',
          conflict: conflict,
          old_memory: oldMemory
        };
      }
    }
    
    return { action: 'no_conflict' };
  }

  /**
   * ========== 主题时间线维护 ==========
   */
  
  /**
   * 获取主题时间线
   * @param {string} topic - 主题
   * @returns {Promise<Array>}
   */
  async getTopicTimeline(topic) {
    await this.initialize();
    
    const allMemories = await this.store.listMemories(1000);
    
    // 筛选主题相关的记忆
    const topicMemories = allMemories
      .filter(m => m.metadata.topic === topic)
      .sort((a, b) => new Date(a.metadata.created_at) - new Date(b.metadata.created_at));
    
    // 构建时间线
    const timeline = [];
    let lastContent = null;
    
    for (const memory of topicMemories) {
      const entry = {
        id: memory.id,
        timestamp: memory.metadata.created_at,
        content: memory.content,
        type: memory.metadata.type,
        priority: memory.metadata.priority
      };
      
      // 检测变化
      if (lastContent && memory.metadata.type === 'preference_change') {
        entry.isChange = true;
        entry.changeFrom = memory.metadata.from;
        entry.changeTo = memory.metadata.to;
      }
      
      timeline.push(entry);
      lastContent = memory.content;
    }
    
    return timeline;
  }

  /**
   * 获取所有主题列表
   * @returns {Promise<Array>}
   */
  async getAllTopics() {
    await this.initialize();
    
    const allMemories = await this.store.listMemories(1000);
    const topics = new Map();
    
    for (const memory of allMemories) {
      const topic = memory.metadata.topic || 'general';
      if (!topics.has(topic)) {
        topics.set(topic, {
          name: topic,
          count: 0,
          last_updated: memory.metadata.created_at
        });
      }
      
      const t = topics.get(topic);
      t.count++;
      if (new Date(memory.metadata.created_at) > new Date(t.last_updated)) {
        t.last_updated = memory.metadata.created_at;
      }
    }
    
    return Array.from(topics.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * ========== 辅助方法 ==========
   */
  
  /**
   * 合并内容
   */
  _mergeContent(existing, newContent) {
    // 去重处理
    if (existing.includes(newContent)) {
      return existing;
    }
    
    return `${existing}\n\n[更新 ${new Date().toLocaleString()}]\n${newContent}`;
  }

  /**
   * 提取关键短语
   */
  _extractKeyPhrases(content) {
    // 简单的关键短语提取
    const phrases = [];
    const sentences = content.split(/[。！？.!?]/);
    
    for (const sentence of sentences) {
      // 提取包含关键词的短语
      if (/喜欢|讨厌|偏好|总是|从不|决定|使用/i.test(sentence)) {
        phrases.push(sentence.trim());
      }
    }
    
    return phrases;
  }

}

module.exports = { TimelineTracker };
