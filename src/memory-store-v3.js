/**
 * MemoryStoreV3 - 统一记忆存储系统
 * 
 * 合并 v2 基础功能 + v3 高级特性:
 * - v2: 实时存储、动态评分、相似检测、用户确认
 * - v3: 时间轴版本化、上下文锚定、遗忘机制、缓存优化
 */

const { MemoryStore } = require('./memory-store');
const { SmartExtractor } = require('./smart-extractor');
const { TimelineTracker } = require('./timeline');
const { ArchiveStore } = require('./archive-store');
const fs = require('fs').promises;
const path = require('path');

class MemoryStoreV3 extends MemoryStore {
  constructor(options = {}) {
    super(options);
    
    this.extractor = new SmartExtractor();
    this.timeline = new TimelineTracker(options);  // 集成时间线追踪
    this.archive = new ArchiveStore(options);      // 集成归档存储
    this.timelinePath = options.timelinePath || './timeline.jsonl';
    
    // 缓存配置
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize || 1000;
    this.cacheTTL = options.cacheTTL || 5000; // 5秒
    
    // 配置参数
    this.config = {
      thresholds: {
        P0: 7.0,
        P1: 6.5,
        P2: 5.0,
        SKIP: 4.0
      },
      decay: {
        P0: { days: 365, rate: 0.1 },
        P1: { days: 30, rate: 0.3 },
        P2: { days: 7, rate: 0.5 }
      },
      conflictWindow: 7,
      contextAnchors: {
        temporary: ['现在', '暂时', '目前', '今天', '这次', '临时', '当前'],
        permanent: ['一直', '永远', '总是', '从来', '根本', '本质', '永远']
      }
    };
  }

  /**
   * 初始化
   */
  async initialize() {
    await super.initialize();
    
    // 基类把 this.extractor 设成了 embedding pipeline
    // 我们把它保存为 this.embedder，让基类 _embed() 能正常工作
    this.embedder = this._embeddingPipeline || this.extractor;
    // 恢复 SmartExtractor
    this.extractor = new SmartExtractor();
    
    await this.timeline.initialize();  // 初始化时间线
    await this.archive.initialize();   // 初始化归档
    await this._ensureTimelineExists();
    console.log('✅ MemoryStoreV3 初始化完成 (合并 v2+v3+Timeline+Archive)');
    return this;
  }

  // ========== 核心存储方法 (合并版) ==========

  /**
   * 智能存储 - 合并 v2 的 addMemory + v3 的 store
   * @param {string} content - 内容
   * @param {Object} metadata - 元数据
   * @returns {Promise<Object>} 存储结果
   */
  async smartStore(content, metadata = {}) {
    const startTime = Date.now();
    
    // 1. 使用 SmartExtractor 计算价值 (v3 增强)
    const baseScore = this.extractor.calculateValue(content);
    
    // 2. 上下文锚定分析 (v3 新增)
    const contextFlags = this._analyzeContext(content, metadata);
    
    // 3. 计算动态优先级和置信度 (v3 增强 + v2 兼容)
    const { priority, confidence, shouldStore } = this._calculatePriority(
      content, baseScore, contextFlags, metadata
    );
    
    if (!shouldStore) {
      return {
        stored: false,
        reason: 'score_below_threshold',
        score: baseScore,
        latency: Date.now() - startTime
      };
    }

    // 4. 生成版本化ID (v3)
    const timestamp = new Date().toISOString();
    const versionId = metadata.id || this._generateVersionId(timestamp);
    
    // 5. 检查 v2 的即时去重
    const vector = await this._embed(content);
    const similarMemories = await this._findSimilar(vector, 0.85, 3);
    
    let mergeResult = null;
    if (similarMemories.length > 0) {
      const bestMatch = similarMemories[0];
      
      // 高度相似：合并 (v2 逻辑)
      if (bestMatch.similarity > 0.95) {
        const merged = await this._mergeMemory(bestMatch.id, content);
        if (merged) {
          await this._appendToTimeline({
            id: bestMatch.id,
            content: `合并: ${content.slice(0, 50)}...`,
            timestamp,
            action: 'merged',
            similarity: bestMatch.similarity
          });
          return {
            stored: true,
            id: bestMatch.id,
            merged: true,
            latency: Date.now() - startTime
          };
        }
      }
      
      // 中度相似：添加相关标记 (v2 逻辑)
      if (bestMatch.similarity >= 0.85) {
        metadata.related_to = bestMatch.id;
        metadata.similarity = bestMatch.similarity;
      }
    }

    // 6. v3 的冲突检测 + 时间线偏好变化追踪
    const conflicts = await this._detectConflicts(content, metadata, vector);
    let conflictResolution = null;
    
    if (conflicts.length > 0) {
      conflictResolution = await this._resolveConflicts(content, confidence, conflicts);
      if (conflictResolution.action === 'skip') {
        return {
          stored: false,
          reason: 'conflict_rejected',
          conflicts,
          latency: Date.now() - startTime
        };
      }
      metadata.conflicting_sources = conflicts.map(c => c.id);
    }
    
    // 6.5 TimelineTracker: 检查偏好变化 (真正集成！)
    const preferenceChange = await this.timeline.checkPreferenceChange(content, metadata);
    if (preferenceChange.action === 'change_recorded') {
      metadata.preference_changed = true;
      metadata.change_record = preferenceChange.conflict;
    }

    // 7. 计算 v2 的质量分数
    const qualityScore = this._calculateQuality(content, metadata);
    
    // 8. 构建完整数据 (v2 + v3 字段合并)
    const data = {
      id: versionId,
      content: content.trim(),
      vector,
      type: metadata.type || this.extractor.extract([content])[0]?.type || 'general',
      topic: metadata.topic || '',
      character: metadata.character || '',
      priority: metadata.priority || priority,
      confidence: confidence,
      date: metadata.date || timestamp.slice(0, 10),
      created_at: timestamp,
      updated_at: timestamp,
      // v2 质量字段
      quality_score: qualityScore,
      // v3 字段
      context: metadata.context || '',
      version: 1,
      // 统计字段 (v2)
      query_count: 0,
      last_queried: '',
      // 去重字段 (v2)
      related_to: metadata.related_to || '',
      similarity: metadata.similarity || 0,
      merge_count: 0,
      // v3 扩展字段
      forgotten: false,
      forgotten_at: '',
      forgotten_reason: '',
      user_confirmed: metadata.user_confirmed || false,
      confirmed_at: metadata.confirmed_at || '',
      conflict_resolved: !!conflictResolution,
      conflict_resolution: conflictResolution?.reason || '',
      sources: metadata.sources || []
    };

    // 9. 写入向量库 (v2 基础)
    await this.table.add([data]);
    
    // 10. 写入时间轴 (v3 新增)
    await this._appendToTimeline(data);
    
    // 11. 更新缓存 (v3 优化)
    this._updateCache(versionId, data);

    console.log(`✅ 记忆已存储: ${versionId.slice(0, 20)}... (质量: ${qualityScore.toFixed(2)}, 优先级: ${priority})`);
    
    return {
      stored: true,
      id: versionId,
      priority,
      confidence,
      quality: qualityScore,
      conflicts: conflicts.length > 0 ? conflicts : null,
      latency: Date.now() - startTime
    };
  }

  /**
   * 带过滤的搜索 (v2 基础 + v3 扩展)
   * @param {string} query - 查询文本
   * @param {Object} filters - 过滤条件
   * @param {number} limit - 返回数量
   * @returns {Array} - 搜索结果
   */
  async searchWithFilter(query, filters = {}, limit = 10) {
    await this.initialize();

    // 1. 基础向量搜索 (v2)
    let results = await this.search(query, limit * 2);

    // 2. 应用过滤器
    if (filters.type) {
      results = results.filter(r => r.metadata?.type === filters.type);
    }
    if (filters.topic) {
      results = results.filter(r => r.metadata?.topic === filters.topic);
    }
    if (filters.priority) {
      results = results.filter(r => r.metadata?.priority === filters.priority);
    }
    if (filters.character) {
      results = results.filter(r => r.metadata?.character === filters.character);
    }
    if (filters.dateFrom) {
      results = results.filter(r => r.metadata?.created_at >= filters.dateFrom);
    }
    if (filters.dateTo) {
      results = results.filter(r => r.metadata?.created_at <= filters.dateTo);
    }
    if (filters.minConfidence) {
      results = results.filter(r => (r.metadata?.confidence || 0) >= filters.minConfidence);
    }

    // 3. 限制返回数量
    return results.slice(0, limit);
  }

  /**
   * 智能检索 - 合并 v2 的 search + v3 的 retrieve + 缓存 + HyDE
   */
  async smartRetrieve(query, options = {}) {
    const startTime = Date.now();
    const {
      limit = 5,
      filters = {},
      minConfidence = 0.5,
      decayAware = true,
      includeHistory = false,
      useCache = true,
      useHyDE = true  // v4.0 新增
    } = options;

    // 1. 缓存检查 (v3 优化)
    const cacheKey = `${query}_${JSON.stringify(filters)}`;
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.time < this.cacheTTL) {
        return { ...cached.data, cached: true, latency: Date.now() - startTime };
      }
    }

    // 2. HyDE 检索优化 (v4.0 新增)
    let searchQuery = query;
    if (useHyDE) {
      const hypothetical = await this._generateHypotheticalMemory(query);
      if (hypothetical) {
        searchQuery = hypothetical;
        console.log(`🔍 HyDE: "${query}" → "${hypothetical.slice(0, 50)}..."`);
      }
    }

    // 3. v2 的过滤搜索
    let results = await this.searchWithFilter(searchQuery, filters, limit * 2);
    
    // 4. 过滤已遗忘的记忆 (v3)
    results = results.filter(r => !r.metadata.forgotten);
    
    // 5. v4.0 的动态衰减处理 (优化版)
    if (decayAware) {
      results = results.map(r => ({
        ...r,
        effective_confidence: this._calculateFinalScore(r),
        original_confidence: r.metadata.confidence || r.metadata.quality_score
      })).filter(r => r.effective_confidence >= minConfidence);
    }

    // 6. 时间轴版本化检索 (v3)
    if (includeHistory) {
      const historyPromises = results.map(r => this._getHistory(r.id));
      const histories = await Promise.all(historyPromises);
      results.forEach((r, i) => {
        r.history = histories[i];
      });
    }

    // 7. 排序和截断
    results.sort((a, b) => (b.effective_confidence || 0) - (a.effective_confidence || 0));
    results = results.slice(0, limit);

    // 8. 更新使用统计 (v2)
    for (const result of results) {
      await this._updateUsageStats(result.id);
    }

    // 9. 缓存结果 (v3)
    if (useCache) {
      this._updateCache(cacheKey, { data: { results, count: results.length }, time: Date.now() });
    }

    return {
      results,
      count: results.length,
      latency: Date.now() - startTime,
      query,
      hyde_used: useHyDE
    };
  }

  /**
   * HyDE: 生成假设记忆 (v4.0 新增)
   * 根据用户查询生成可能存在的相关记忆，提升检索召回
   */
  async _generateHypotheticalMemory(query) {
    // 简单规则：根据查询类型生成假设记忆
    const patterns = [
      { pattern: /喜欢|偏好|口味|爱好/, template: `用户喜欢${query.replace(/喜欢|偏好|口味|爱好/g, '')}` },
      { pattern: /项目|配置|设置/, template: `项目配置: ${query}` },
      { pattern: /问题|错误|失败/, template: `问题记录: ${query}` },
      { pattern: /怎么|如何|方法/, template: `解决方案: ${query}` }
    ];

    for (const { pattern, template } of patterns) {
      if (pattern.test(query)) {
        return template;
      }
    }

    // 默认：直接返回原查询
    return null;
  }

  /**
   * v4.0 最终评分: 相似度×0.7 + 时间新鲜度×0.2 + 使用频率×0.1
   */
  _calculateFinalScore(memory) {
    const baseConfidence = memory.metadata.confidence || memory.metadata.quality_score || 0.5;
    
    // 1. 相似度 (已包含在 baseConfidence 中)
    const similarityScore = baseConfidence;
    
    // 2. 时间新鲜度 (越新越好)
    const created = new Date(memory.metadata.created_at || memory.metadata.date);
    const daysOld = (Date.now() - created) / (1000 * 60 * 60 * 24);
    const freshnessScore = Math.max(0, 1 - daysOld / 365); // 一年衰减到 0
    
    // 3. 使用频率 (越常用越好)
    const queryCount = memory.metadata.query_count || 0;
    const usageScore = Math.min(1, Math.log(queryCount + 1) / 5); // log(126) ≈ 1
    
    // 加权计算
    const finalScore = similarityScore * 0.7 + freshnessScore * 0.2 + usageScore * 0.1;
    
    // 优先级加成
    const priorityBoost = { P0: 1.2, P1: 1.0, P2: 0.8, P3: 0.6 }[memory.metadata.priority] || 1.0;
    
    // 用户确认加成
    const confirmedBoost = memory.metadata.user_confirmed ? 1.1 : 1.0;
    
    return Math.min(1, finalScore * priorityBoost * confirmedBoost);
  }

  // ========== v3 新增/增强方法 ==========

  /**
   * 用户确认 (v2 markUserConfirmed + v3 confirm 合并)
   */
  async confirm(memoryId) {
    const memory = await this.getMemory(memoryId);
    if (!memory) return { success: false, error: 'not_found' };

    const updates = {
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
      confidence: Math.min((memory.metadata.confidence || 5) * 1.2, 10)
    };

    await this._updateMemoryFields(memoryId, updates);
    await this._appendToTimeline({ id: memoryId, action: 'confirmed', timestamp: new Date().toISOString() });

    return {
      success: true,
      newConfidence: updates.confidence
    };
  }

  /**
   * 遗忘记忆 (v3 新增)
   */
  async forget(memoryId, reason = '') {
    const memory = await this.getMemory(memoryId);
    if (!memory) return { success: false, error: 'not_found' };

    const updates = {
      forgotten: true,
      forgotten_at: new Date().toISOString(),
      forgotten_reason: reason,
      priority: 'P3'
    };

    await this._updateMemoryFields(memoryId, updates);
    await this._appendToTimeline({ id: memoryId, action: 'forgotten', reason, timestamp: new Date().toISOString() });

    return { success: true };
  }

  /**
   * 智能批量存储 (v3 autoStore)
   */
  async autoStore(text) {
    const extracted = this.extractor.extract(text);
    const results = [];
    
    for (const item of extracted) {
      const result = await this.smartStore(item.content, {
        type: item.type,
        confidence: item.confidence
      });
      results.push(result);
    }
    
    return {
      extracted: extracted.length,
      stored: results.filter(r => r.stored).length,
      skipped: results.filter(r => !r.stored).length,
      details: results
    };
  }

  // ========== 私有方法 ==========

  _generateVersionId(timestamp) {
    return `mem_${timestamp.replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  _analyzeContext(content, metadata) {
    const flags = { temporary: false, permanent: false, explicit: metadata.priority || null };
    
    for (const kw of this.config.contextAnchors.temporary) {
      if (content.includes(kw)) { flags.temporary = true; break; }
    }
    for (const kw of this.config.contextAnchors.permanent) {
      if (content.includes(kw)) { flags.permanent = true; break; }
    }
    return flags;
  }

  _calculatePriority(content, baseScore, contextFlags, metadata) {
    let score = baseScore;
    if (contextFlags.permanent) score += 2;
    if (contextFlags.temporary) score -= 1;
    if (contextFlags.explicit === 'P0') score = Math.max(score, 8);
    if (contextFlags.explicit === 'P1') score = Math.max(score, 7);
    
    let priority = 'P3';
    if (score >= this.config.thresholds.P0) priority = 'P0';
    else if (score >= this.config.thresholds.P1) priority = 'P1';
    else if (score >= this.config.thresholds.P2) priority = 'P2';
    
    return { priority, confidence: Math.min(score, 10), shouldStore: score >= this.config.thresholds.SKIP };
  }

  async _detectConflicts(content, metadata, vector) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.conflictWindow);
    
    const similar = await this._findSimilar(vector, 0.7, 10);
    const conflicts = [];
    
    for (const existing of similar) {
      // 修正：从 metadata 中获取日期
      const existingDate = new Date(existing.metadata?.created_at || existing.metadata?.date || 0);
      if (existingDate < cutoffDate) continue;
      
      if (this._checkContradiction(content, existing.content)) {
        conflicts.push({
          id: existing.id,
          content: existing.content,
          similarity: existing.similarity,
          existing_date: existing.metadata?.created_at
        });
      }
    }
    return conflicts;
  }

  _checkContradiction(text1, text2) {
    const negations = ['不', '没', '无', '非', '讨厌', '厌恶', '拒绝'];
    for (const neg of negations) {
      if ((text1.includes(neg) && !text2.includes(neg)) ||
          (!text1.includes(neg) && text2.includes(neg))) {
        // 简单清理后再匹配
        const core1 = text1.replace(new RegExp(neg, 'g'), '').trim();
        const core2 = text2.replace(new RegExp(neg, 'g'), '').trim();
        // 修正：中文环境下使用 0.5 作为阈值，因为缺少分词
        if (this._calculateSimilarity(core1, core2) > 0.5) return true;
      }
    }
    return false;
  }

  _calculateSimilarity(text1, text2) {
    // 优化：针对中文的字符级相似度
    const s1 = text1.toLowerCase().replace(/\s+/g, '');
    const s2 = text2.toLowerCase().replace(/\s+/g, '');
    
    const chars1 = new Set(s1.split(''));
    const chars2 = new Set(s2.split(''));
    
    const intersection = new Set([...chars1].filter(x => chars2.has(x)));
    const union = new Set([...chars1, ...chars2]);
    
    return intersection.size / union.size;
  }

  async _resolveConflicts(newContent, newConfidence, conflicts) {
    console.log('⚖️ 开启深度逻辑仲裁...');
    
    // 学习 cellcog 的逻辑树思路：优先保留“系统性决策”而非“临时性陈述”
    const avgConflictConf = conflicts.reduce((s, c) => s + (c.confidence || 5), 0) / conflicts.length;
    
    // 逻辑判准 1: 如果新内容包含“决定”、“确定”、“以后”，赋予逻辑优先级
    const isSystemic = /决定|确定|以后|总是|永远/.test(newContent);
    if (isSystemic && newConfidence >= avgConflictConf) {
      return { action: 'override', reason: 'logic_tree_priority:systemic_decision' };
    }

    // 逻辑判准 2: 时间轴权重。如果冲突项是多年前的且当前有高热度，则覆盖
    if (newConfidence > avgConflictConf + 1.5) {
      return { action: 'override', reason: 'higher_confidence_gap' };
    }
    
    if (Math.abs(newConfidence - avgConflictConf) < 0.8) {
      return { action: 'merge', reason: 'semantic_fusion' };
    }
    
    return { action: 'skip', reason: 'logic_tree_rejection:legacy_wins' };
  }

  _applyDecay(memory) {
    const created = new Date(memory.metadata.created_at || memory.metadata.date);
    const daysOld = (new Date() - created) / (1000 * 60 * 60 * 24);
    const priority = memory.metadata.priority || 'P2';
    const decayConfig = this.config.decay[priority] || this.config.decay.P2;
    
    if (daysOld < decayConfig.days) return memory.metadata.confidence || memory.metadata.quality_score || 5;
    
    const decayFactor = Math.exp(-decayConfig.rate * (daysOld - decayConfig.days) / 30);
    let effective = (memory.metadata.confidence || memory.metadata.quality_score || 5) * decayFactor;
    
    if (memory.metadata.user_confirmed) effective *= 1.5;
    return effective;
  }

  async _ensureTimelineExists() {
    try {
      await fs.access(this.timelinePath);
    } catch {
      await fs.writeFile(this.timelinePath, '', 'utf8');
    }
  }

  async _appendToTimeline(record) {
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.timelinePath, line, 'utf8');
  }

  async _getHistory(memoryId) {
    try {
      const data = await fs.readFile(this.timelinePath, 'utf8');
      const lines = data.split('\n').filter(l => l.trim());
      return lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(r => r && (r.id === memoryId || r.id?.startsWith(memoryId.slice(0, 20))))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch {
      return [];
    }
  }

  _updateCache(key, value) {
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  async _updateMemoryFields(id, updates) {
    const memory = await this.getMemory(id);
    if (!memory) return false;
    
    const updatedData = { ...memory, ...updates, updated_at: new Date().toISOString() };
    await this.deleteMemory(id);
    await this.table.add([{
      ...updatedData,
      vector: memory.vector || await this._embed(memory.content)
    }]);
    return true;
  }

  /**
   * 自动降级检查 - 真正激活的三级存储！
   * 由 Cron 每日调用
   */
  async autoDemote() {
    console.log('🔄 MemoryStoreV3 执行自动降级检查...');
    const demoted = await this.archive.autoDemote();
    console.log(`✅ 自动降级完成: ${demoted} 条记忆已处理`);
    return demoted;
  }
}

module.exports = { MemoryStoreV3 };
