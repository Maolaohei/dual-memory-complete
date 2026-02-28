/**
 * 检索反馈回路
 * - 记录检索命中次数
 * - 分析检索效果
 * - 自动调整记忆权重
 */

const fs = require('fs').promises;
const path = require('path');

class RetrievalFeedback {
  constructor(options = {}) {
    this.logPath = options.logPath || './data/retrieval-log.jsonl';
    this.statsPath = options.statsPath || './data/retrieval-stats.json';
    this.store = options.store || null;
    
    // 统计数据
    this.stats = {
      totalQueries: 0,
      totalHits: 0,
      avgLatency: 0,
      topQueries: {},
      memoryHits: {},
      lastUpdated: null
    };
  }

  /**
   * 记录检索事件
   */
  async logRetrieval(query, results, latency) {
    const event = {
      timestamp: new Date().toISOString(),
      query,
      resultCount: results.length,
      latency,
      resultIds: results.map(r => r.id)
    };

    // 追加到日志
    await fs.appendFile(this.logPath, JSON.stringify(event) + '\n');

    // 更新统计
    this.stats.totalQueries++;
    this.stats.totalHits += results.length;
    this.stats.avgLatency = (this.stats.avgLatency * (this.stats.totalQueries - 1) + latency) / this.stats.totalQueries;
    this.stats.lastUpdated = new Date().toISOString();

    // 更新热门查询
    const queryKey = query.toLowerCase().slice(0, 50);
    this.stats.topQueries[queryKey] = (this.stats.topQueries[queryKey] || 0) + 1;

    // 更新记忆命中次数
    for (const result of results) {
      this.stats.memoryHits[result.id] = (this.stats.memoryHits[result.id] || 0) + 1;
    }

    // 定期保存统计
    if (this.stats.totalQueries % 10 === 0) {
      await this._saveStats();
    }
  }

  /**
   * 获取记忆的命中次数
   */
  getHitCount(memoryId) {
    return this.stats.memoryHits[memoryId] || 0;
  }

  /**
   * 获取热门查询
   */
  getTopQueries(limit = 10) {
    return Object.entries(this.stats.topQueries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  /**
   * 获取高频记忆
   */
  getTopMemories(limit = 10) {
    return Object.entries(this.stats.memoryHits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }));
  }

  /**
   * 分析检索效果
   */
  async analyzeEffectiveness() {
    const report = {
      timestamp: new Date().toISOString(),
      overview: {
        totalQueries: this.stats.totalQueries,
        totalHits: this.stats.totalHits,
        avgHitsPerQuery: this.stats.totalQueries > 0 ? 
          (this.stats.totalHits / this.stats.totalQueries).toFixed(2) : 0,
        avgLatency: this.stats.avgLatency.toFixed(0) + 'ms'
      },
      topQueries: this.getTopQueries(5),
      topMemories: this.getTopMemories(5),
      recommendations: []
    };

    // 生成建议
    if (this.stats.totalQueries > 0) {
      const avgHits = this.stats.totalHits / this.stats.totalQueries;
      
      if (avgHits < 2) {
        report.recommendations.push({
          type: 'low_recall',
          message: '平均命中数较低，考虑启用 HyDE 或调整相似度阈值'
        });
      }

      if (this.stats.avgLatency > 500) {
        report.recommendations.push({
          type: 'slow_retrieval',
          message: '检索延迟较高，考虑优化向量库索引'
        });
      }

      // 检查冷门记忆
      const coldMemories = Object.keys(this.stats.memoryHits).length;
      if (coldMemories < this.stats.totalQueries * 0.3) {
        report.recommendations.push({
          type: 'cold_memories',
          message: '大量记忆未被检索，考虑清理或优化检索策略'
        });
      }
    }

    return report;
  }

  /**
   * 保存统计
   */
  async _saveStats() {
    try {
      await fs.writeFile(this.statsPath, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      // 静默失败
    }
  }

  /**
   * 加载统计
   */
  async loadStats() {
    try {
      const data = await fs.readFile(this.statsPath, 'utf8');
      this.stats = JSON.parse(data);
    } catch (error) {
      // 使用默认值
    }
  }
}

module.exports = { RetrievalFeedback };
