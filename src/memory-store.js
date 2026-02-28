/**
 * MemoryStore - 向量记忆存储系统 (Node.js + LanceDB)
 * 替代原 Python ChromaDB 实现
 */

const { pipeline } = require('@xenova/transformers');
const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs');

// 加载配置
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../config/default.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (e) {
    console.warn('⚠️  无法加载配置，使用默认值');
    return {
      embedding: {
        current: 'mpnet',
        models: {
          mpnet: { name: 'Xenova/all-mpnet-base-v2', dimensions: 768 }
        }
      }
    };
  }
}

class MemoryStore {
  /**
   * 初始化记忆存储
   * @param {Object} options - 配置选项
   * @param {string} options.dbPath - LanceDB 数据库路径
   * @param {string} options.tableName - 表名
   */
  constructor(options = {}) {
    this.config = loadConfig();
    this.dbPath = options.dbPath || this.config.paths?.dbPath || './lancedb';
    this.tableName = options.tableName || this.config.paths?.tableName || 'memories';
    
    // 获取当前模型配置
    const currentModelKey = this.config.embedding?.current || 'mpnet';
    this.modelConfig = this.config.embedding?.models?.[currentModelKey] || 
                       this.config.embedding?.models?.mpnet ||
                       { name: 'Xenova/all-mpnet-base-v2', dimensions: 768 };
    
    this.dimensions = this.modelConfig.dimensions || 768;
    this.modelName = this.modelConfig.name || 'Xenova/all-mpnet-base-v2';
    
    console.log(`📊 使用模型: ${currentModelKey} (${this.modelName}, ${this.dimensions}维)`);
    
    this.db = null;
    this.table = null;
    this.extractor = null;
    this._initialized = false;
  }

  /**
   * 初始化（异步）
   */
  async initialize() {
    if (this._initialized) return;

    // 1. 加载嵌入模型
    console.log(`🧠 加载 embedding 模型: ${this.modelName} (${this.dimensions}维)...`);
    this._embeddingPipeline = await pipeline('feature-extraction', this.modelName);
    this.extractor = this._embeddingPipeline;
    console.log('✅ 模型加载完成');

    // 2. 连接 LanceDB
    this.db = await lancedb.connect(this.dbPath);

    // 3. 打开或创建表
    try {
      this.table = await this.db.openTable(this.tableName);
      console.log(`📁 已打开表: ${this.tableName}`);
    } catch (e) {
      // 表不存在，创建空表 (提供完整示例以推断 schema)
      // 注意: Arrow 需要非 null 值来推断类型，所以用空字符串代替 null
      const now = new Date().toISOString();
      const emptyData = [{
        id: 'initial_marker',
        content: 'system_marker',
        vector: Array(this.dimensions).fill(0),
        type: 'system',
        topic: 'system',
        character: 'system',
        priority: 'P3',
        confidence: 1.0,
        date: now.slice(0, 10),
        created_at: now,
        updated_at: now,
        quality_score: 1.0,
        context: '',
        version: 1,
        query_count: 0,
        last_queried: '',
        related_to: '',
        similarity: 0,
        merge_count: 0,
        forgotten: false,
        forgotten_at: '',
        forgotten_reason: '',
        user_confirmed: false,
        confirmed_at: '',
        conflict_resolved: false,
        conflict_resolution: '',
        sources: ['']
      }];
      this.table = await this.db.createTable(this.tableName, emptyData);
      console.log(`📁 已创建新表并初始化 Schema: ${this.tableName}`);
    }

    this._initialized = true;
  }

  /**
   * 生成文本嵌入
   * @param {string} text - 输入文本
   * @param {string} mode - 模式: 'passage' (存储) 或 'query' (检索)
   * @returns {number[]} - 向量 (维度由配置决定)
   */
  async _embed(text, mode = 'passage') {
    // 优先使用 this.embedder (被子类设置)，否则使用 this.extractor
    let embedder = this.embedder || this.extractor;
    
    // 如果 embedder 不是函数，可能是 SmartExtractor，需要回退
    if (embedder && typeof embedder !== 'function' && this._embeddingPipeline) {
      embedder = this._embeddingPipeline;
    }
    
    if (!embedder || typeof embedder !== 'function') {
      throw new Error('MemoryStore not initialized. Call initialize() first.');
    }

    // BGE 模型需要前缀
    let processedText = text;
    if (this.modelConfig.prefix) {
      const prefix = mode === 'query' ? this.modelConfig.prefix.query : this.modelConfig.prefix.passage;
      processedText = prefix + text;
    }

    const output = await embedder(processedText, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  }

  /**
   * 计算向量相似度 (余弦相似度)
   * @param {Array} vec1 - 向量1
   * @param {Array} vec2 - 向量2
   * @returns {number} - 相似度 (0-1)
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
   * 查找相似记忆
   * @param {Array} vector - 查询向量
   * @param {number} threshold - 相似度阈值
   * @param {number} limit - 返回数量
   * @returns {Array} - 相似记忆列表
   */
  async _findSimilar(vector, threshold = 0.85, limit = 5) {
    await this.initialize();
    
    try {
      // 使用向量搜索查找相似内容
      const results = await this.table
        .search(vector)
        .limit(limit * 2) // 多取一些用于过滤
        .execute();
      
      // 计算精确相似度并过滤
      return results
        .map(r => ({
          id: r.id,
          content: r.content,
          similarity: this._cosineSimilarity(vector, r.vector),
          existingData: r
        }))
        .filter(r => r.similarity >= threshold)
        .slice(0, limit);
    } catch (error) {
      // 搜索失败时返回空数组
      return [];
    }
  }

  /**
   * 计算记忆质量分数
   * @param {string} content - 记忆内容
   * @param {Object} metadata - 元数据
   * @returns {number} - 质量分数 (0-1)
   */
  _calculateQuality(content, metadata = {}) {
    let score = 0.5; // 基础分
    
    // 1. 内容特征加分
    // 包含具体信息（数字、API key、路径、用户名）+0.15
    if (/\d+|api.?key|token|password|github|\/\w+\/|@[\w]+/i.test(content)) {
      score += 0.15;
    }
    
    // 包含决策/偏好类关键词 +0.15
    if (/决定|偏好|喜欢|不喜欢|总是|从不|必须|禁止/i.test(content)) {
      score += 0.15;
    }
    
    // 2. 用户明确指令加分
    if (/记住|别忘|重要| critical|permanent/i.test(content)) {
      score += 0.2;
    }
    
    // 3. 长度适中加分（太短可能没价值，太长可能太啰嗦）
    const length = content.length;
    if (length > 30 && length < 500) {
      score += 0.1;
    } else if (length >= 500 && length < 1000) {
      score += 0.05;
    }
    
    // 4. 元数据质量
    if (metadata.priority === 'P0') score += 0.15;
    else if (metadata.priority === 'P1') score += 0.1;
    
    if (metadata.topic) score += 0.05;
    if (metadata.type) score += 0.05;
    
    // 5. 减分项
    // 太短的记录
    if (length < 20) score -= 0.2;
    
    // 临时性内容
    if (/临时|测试|debug|tmp/i.test(content)) score -= 0.15;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * 更新记忆使用统计（用于动态质量调整）
   * @param {string} memoryId - 记忆ID
   */
  async _updateUsageStats(memoryId) {
    try {
      const memory = await this.getMemory(memoryId);
      if (!memory) return;
      
      // Phase 3: 更新查询统计
      const updatedMetadata = {
        ...memory.metadata,
        query_count: (memory.metadata.query_count || 0) + 1,
        last_queried: new Date().toISOString()
      };
      
      // 重新计算动态评分
      const dynamicScore = this._calculateDynamicScore({
        ...memory,
        metadata: updatedMetadata
      });
      
      updatedMetadata.dynamic_score = dynamicScore;
      updatedMetadata.score_updated_at = new Date().toISOString();
      
      // 删除重插以更新 (LanceDB 不支持直接更新)
      await this.deleteMemory(memoryId);
      await this.addMemory(memory.content, updatedMetadata);
      
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }

  /**
   * ========== Phase 3: 动态评分系统 ==========
   */
  
  /**
   * 计算动态质量分数
   * @param {Object} memory - 记忆对象
   * @returns {number} - 动态分数 (0-1)
   */
  _calculateDynamicScore(memory) {
    let score = memory.metadata.quality_score || 0.5;
    const now = new Date();
    const reasons = ['基础分: ' + score.toFixed(2)];
    
    // 1. 引用频率加分 (+0.15 max)
    const queryCount = memory.metadata.query_count || 0;
    if (queryCount > 0) {
      const usageBoost = 0.1 * Math.log(queryCount + 1);
      score += Math.min(0.15, usageBoost);
      reasons.push(`引用频率 +${usageBoost.toFixed(2)} (${queryCount}次查询)`);
    }
    
    // 2. 时间衰减 (-0.1/月)
    const lastQueried = memory.metadata.last_queried 
      ? new Date(memory.metadata.last_queried) 
      : new Date(memory.metadata.created_at);
    const monthsSinceAccess = (now - lastQueried) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceAccess > 0) {
      const decay = 0.05 * monthsSinceAccess;
      score -= Math.min(0.3, decay);  // 最多衰减0.3
      reasons.push(`时间衰减 -${decay.toFixed(2)} (${monthsSinceAccess.toFixed(1)}月未访问)`);
    }
    
    // 3. 用户确认加分 (+0.2)
    if (memory.metadata.user_confirmed) {
      score += 0.2;
      reasons.push('用户确认 +0.20');
    }
    
    // 4. 冲突解决加分 (+0.1)
    if (memory.metadata.conflict_resolved) {
      score += 0.1;
      reasons.push('冲突解决 +0.10');
    }
    
    // 5. 多源验证加分 (+0.15)
    const sources = memory.metadata.sources || [];
    if (sources.length > 1) {
      const multiSourceBoost = Math.min(0.15, 0.05 * (sources.length - 1));
      score += multiSourceBoost;
      reasons.push(`多源验证 +${multiSourceBoost.toFixed(2)} (${sources.length}个来源)`);
    }
    
    const finalScore = Math.max(0, Math.min(1, score));
    
    return {
      score: finalScore,
      reasons,
      query_count: queryCount,
      months_since_access: monthsSinceAccess
    };
  }
  
  /**
   * 标记用户确认
   * @param {string} memoryId - 记忆ID
   */
  async markUserConfirmed(memoryId) {
    try {
      const memory = await this.getMemory(memoryId);
      if (!memory) return false;
      
      const updatedMetadata = {
        ...memory.metadata,
        user_confirmed: true,
        confirmed_at: new Date().toISOString()
      };
      
      await this.deleteMemory(memoryId);
      await this.addMemory(memory.content, updatedMetadata);
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 添加冲突解决记录
   * @param {string} memoryId - 记忆ID
   * @param {string} resolution - 解决说明
   */
  async markConflictResolved(memoryId, resolution) {
    try {
      const memory = await this.getMemory(memoryId);
      if (!memory) return false;
      
      const updatedMetadata = {
        ...memory.metadata,
        conflict_resolved: true,
        conflict_resolution: resolution,
        resolved_at: new Date().toISOString()
      };
      
      await this.deleteMemory(memoryId);
      await this.addMemory(memory.content, updatedMetadata);
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 添加来源
   * @param {string} memoryId - 记忆ID
   * @param {string} source - 来源标识
   */
  async addSource(memoryId, source) {
    try {
      const memory = await this.getMemory(memoryId);
      if (!memory) return false;
      
      const sources = memory.metadata.sources || [];
      if (!sources.includes(source)) {
        sources.push(source);
      }
      
      const updatedMetadata = {
        ...memory.metadata,
        sources
      };
      
      await this.deleteMemory(memoryId);
      await this.addMemory(memory.content, updatedMetadata);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 合并记忆内容
   * @param {string} existingId - 现有记忆ID
   * @param {string} newContent - 新内容
   * @returns {boolean} - 是否成功
   */
  async _mergeMemory(existingId, newContent) {
    try {
      // 获取现有记忆
      const existing = await this.getMemory(existingId);
      if (!existing) return false;
      
      // 合并内容（去重 + 时间戳更新）
      const mergedContent = `${existing.content}\n\n[更新于 ${new Date().toISOString()}]\n${newContent}`;
      
      // 重新生成向量
      const newVector = await this._embed(mergedContent);
      
      // 重新计算质量分数
      const quality = this._calculateQuality(mergedContent, existing.metadata);
      
      // 删除旧记录并添加新记录（LanceDB不支持直接更新）
      await this.deleteMemory(existingId);
      
      await this.table.add([{
        id: existingId,
        content: mergedContent,
        vector: newVector,
        ...existing.metadata,
        updated_at: new Date().toISOString(),
        merge_count: (existing.metadata.merge_count || 0) + 1,
        quality_score: quality
      }]);
      
      console.log(`🔄 已合并记忆: ${existingId.slice(0, 20)}... (质量: ${quality.toFixed(2)})`);
      return true;
    } catch (error) {
      console.error(`合并记忆失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 添加记忆（带即时去重）
   * @param {string} content - 记忆内容
   * @param {Object} metadata - 元数据
   * @param {string} memoryId - 可选的自定义ID
   * @returns {string} - 记忆ID
   */
  async addMemory(content, metadata = {}, memoryId = null) {
    await this.initialize();

    // 生成嵌入向量
    const vector = await this._embed(content);
    
    // 查找相似记忆（即时去重）
    const similarMemories = await this._findSimilar(vector, 0.85, 3);
    
    if (similarMemories.length > 0) {
      const bestMatch = similarMemories[0];
      
      // 相似度 > 0.95: 合并内容
      if (bestMatch.similarity > 0.95) {
        console.log(`📝 发现高度相似记忆 (${bestMatch.similarity.toFixed(3)})，执行合并...`);
        const merged = await this._mergeMemory(bestMatch.id, content);
        if (merged) return bestMatch.id;
      }
      
      // 相似度 0.85-0.95: 添加为版本（添加版本标记）
      if (bestMatch.similarity >= 0.85) {
        console.log(`📝 发现相似记忆 (${bestMatch.similarity.toFixed(3)})，添加版本标记...`);
        metadata.related_to = bestMatch.id;
        metadata.similarity = bestMatch.similarity;
      }
    }

    // 生成ID
    const id = memoryId || this._generateId();

    // 计算质量分数
    const qualityScore = this._calculateQuality(content, metadata);

    // 准备数据 - 必须包含所有 schema 字段
    const data = {
      id,
      content,
      vector,
      type: metadata.type || '',
      topic: metadata.topic || '',
      character: metadata.character || '',
      priority: metadata.priority || '',
      confidence: metadata.confidence || 1.0,
      date: metadata.date || new Date().toISOString().slice(0, 10),
      created_at: metadata.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // 质量分数
      quality_score: qualityScore,
      context: metadata.context || '',
      version: metadata.version || 1,
      // 使用统计
      query_count: 0,
      last_queried: '',
      // 去重相关字段
      related_to: metadata.related_to || '',
      similarity: metadata.similarity || 0,
      merge_count: 0,
      // 遗忘机制字段
      forgotten: false,
      forgotten_at: '',
      forgotten_reason: '',
      // 用户确认字段
      user_confirmed: false,
      confirmed_at: '',
      // 冲突解决字段
      conflict_resolved: false,
      conflict_resolution: '',
      // 来源字段
      sources: metadata.sources || ['']
    };

    // 添加到表
    await this.table.add([data]);
    
    if (similarMemories.length === 0) {
      console.log(`✅ 新记忆已添加: ${id.slice(0, 20)}... (质量: ${qualityScore.toFixed(2)})`);
    } else {
      console.log(`✅ 版本记忆已添加: ${id.slice(0, 20)}... (质量: ${qualityScore.toFixed(2)})`);
    }

    return id;
  }

  /**
   * 搜索记忆
   * @param {string} query - 查询文本
   * @param {number} nResults - 返回结果数量
   * @returns {Array} - 搜索结果
   */
  async search(query, nResults = 5) {
    await this.initialize();

    // 生成查询向量 (使用 query 模式)
    const queryVector = await this._embed(query, 'query');

    // 执行搜索
    const results = await this.table
      .search(queryVector)
      .limit(nResults * 2) // 多取一些用于过滤
      .execute();

    // 格式化结果，过滤掉系统标记和已遗忘的记忆
    return results
      .filter(r => r.type !== 'system' && r.content !== 'system_marker' && !r.forgotten)
      .slice(0, nResults)
      .map(r => ({
        id: r.id,
        content: r.content,
        metadata: {
          type: r.type,
          topic: r.topic,
          character: r.character,
          priority: r.priority,
          date: r.date,
          created_at: r.created_at,
          confidence: r.confidence,
          quality_score: r.quality_score,
          forgotten: r.forgotten
        }
      }));
  }

  /**
   * 获取记忆详情
   * @param {string} id - 记忆ID
   * @returns {Object|null}
   */
  async getMemory(id) {
    await this.initialize();

    // LanceDB 暂不支持直接按 ID 查询，使用 filter
    const results = await this.table
      .search([])
      .where(`id = '${id}'`)
      .limit(1)
      .execute();

    if (results.length === 0) return null;

    const r = results[0];
    return {
      id: r.id,
      content: r.content,
      metadata: {
        type: r.type,
        topic: r.topic,
        character: r.character,
        priority: r.priority,
        date: r.date,
        created_at: r.created_at
      }
    };
  }

  /**
   * 删除记忆
   * @param {string} id - 记忆ID
   */
  /**
   * 根据 ID 删除记忆
   * 优化：使用 LanceDB 原生方法
   * @param {string} id - 记忆ID
   */
  async deleteMemory(id) {
    await this.initialize();
    await this.table.delete(`id = '${id.replace(/'/g, "\\'")}'`);
    console.log(`✅ 已从向量库删除记忆: ${id}`);
  }

  /**
   * 获取记忆数量
   * @returns {number}
   */
  async count() {
    await this.initialize();
    return await this.table.countRows();
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  async getStats() {
    await this.initialize();
    const count = await this.count();
    
    // 获取样本以进行简单分类统计
    const all = await this.listMemories(1000);
    
    const byType = {};
    const byTopic = {};
    
    all.forEach(m => {
      const type = m.metadata?.type || 'unknown';
      const topic = m.metadata?.topic || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      byTopic[topic] = (byTopic[topic] || 0) + 1;
    });
    
    return {
      total: count,
      by_type: byType,
      by_topic: byTopic
    };
  }

  /**
   * 列出所有记忆
   * @param {number} limit - 数量限制
   * @returns {Array}
   */
  async listMemories(limit = 100) {
    await this.initialize();

    // 使用 filter 获取所有记录（不指定 select，自动包含所有字段）
    try {
      const results = await this.table
        .filter('id IS NOT NULL')
        .limit(limit)
        .execute();

      return results.map(r => ({
        id: r.id,
        content: r.content,
        metadata: {
          type: r.type || '',
          topic: r.topic || '',
          character: r.character || '',
          priority: r.priority || 'P2',
          date: r.date || '',
          created_at: r.created_at || ''
        }
      }));
    } catch (e) {
      console.warn('列表查询失败:', e.message);
      return [];
    }
  }

  /**
   * 清空所有记忆
   */
  async clear() {
    await this.initialize();
    await this.db.dropTable(this.tableName);
    this.table = await this.db.createTable(this.tableName, []);
  }

  /**
   * 生成唯一ID
   */
  _generateId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const random = Math.floor(Math.random() * 10000);
    return `mem_${dateStr}_${timeStr}_${random}`;
  }
}

module.exports = { MemoryStore };
