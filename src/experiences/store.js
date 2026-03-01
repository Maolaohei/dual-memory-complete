/**
 * ExperienceStore - 经验存储
 * 
 * 功能：
 * 1. 存储任务执行经验
 * 2. 检索相似经验
 * 3. 经验滚动合并
 * 4. 统计报告
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { fingerprintSimilarity } = require('./fingerprint');

// 经验库路径
const EXPERIENCES_PATH = path.resolve(__dirname, '../../../experiences');
const INDEX_PATH = path.join(EXPERIENCES_PATH, 'index.json');
const STATS_PATH = path.join(EXPERIENCES_PATH, 'stats/report.json');

class ExperienceStore {
  constructor() {
    this.index = null;
    this.cache = new Map(); // 内存缓存
  }

  /**
   * 初始化
   */
  async initialize() {
    await this._loadIndex();
    console.log('✅ ExperienceStore 初始化完成');
  }

  /**
   * 加载索引
   */
  async _loadIndex() {
    try {
      const data = await fs.readFile(INDEX_PATH, 'utf-8');
      this.index = JSON.parse(data);
    } catch (err) {
      // 创建默认索引
      this.index = {
        version: '1.0.0',
        categories: {},
        index: {}
      };
      await this._saveIndex();
    }
  }

  /**
   * 保存索引
   */
  async _saveIndex() {
    await fs.writeFile(INDEX_PATH, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  /**
   * 查找最佳匹配经验
   * @param {Object} fingerprint - 任务指纹
   * @returns {Promise<Object|null>} 匹配的经验
   */
  async findBest(fingerprint) {
    if (!fingerprint) return null;

    // 1. 精确匹配
    const exactMatch = this.index.index[fingerprint.id];
    if (exactMatch) {
      const experience = await this._loadExperience(exactMatch.file, exactMatch.key);
      if (experience) {
        return { ...experience, matchType: 'exact', similarity: 1.0 };
      }
    }

    // 2. 模糊匹配
    let bestMatch = null;
    let bestSimilarity = 0.6; // 最低阈值

    for (const [fpId, entry] of Object.entries(this.index.index)) {
      const similarity = fingerprintSimilarity(fingerprint, { id: fpId, type: entry.type });
      
      if (similarity > bestSimilarity) {
        const experience = await this._loadExperience(entry.file, entry.key);
        if (experience) {
          bestMatch = { ...experience, matchType: 'fuzzy', similarity };
          bestSimilarity = similarity;
        }
      }
    }

    return bestMatch;
  }

  /**
   * 加载单个经验
   */
  async _loadExperience(categoryFile, key) {
    // 检查缓存
    const cacheKey = `${categoryFile}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const filePath = path.join(EXPERIENCES_PATH, categoryFile);
      const data = await fs.readFile(filePath, 'utf-8');
      const experiences = JSON.parse(data);
      
      const experience = experiences[key];
      if (experience) {
        this.cache.set(cacheKey, experience);
        return experience;
      }
    } catch (err) {
      // 文件不存在或解析失败
    }

    return null;
  }

  /**
   * 保存经验
   * @param {Object} experience - 经验对象
   */
  async save(experience) {
    if (!experience || !experience.fingerprint) return;

    const { fingerprint, optimal_steps, dead_ends, stats } = experience;
    const category = fingerprint.type || 'general';
    const categoryFile = this._getCategoryFile(category);

    // 加载或创建分类文件
    let experiences = {};
    try {
      const filePath = path.join(EXPERIENCES_PATH, categoryFile);
      const data = await fs.readFile(filePath, 'utf-8');
      experiences = JSON.parse(data);
    } catch (err) {
      // 文件不存在，创建新的
    }

    // 保存经验
    const key = fingerprint.id;
    experiences[key] = {
      fingerprint,
      optimal_steps: optimal_steps || [],
      dead_ends: dead_ends || [],
      stats: stats || { total_executions: 1, success_rate: 1.0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 写入文件
    const filePath = path.join(EXPERIENCES_PATH, categoryFile);
    await fs.writeFile(filePath, JSON.stringify(experiences, null, 2), 'utf-8');

    // 更新索引
    this.index.index[fingerprint.id] = {
      type: category,
      file: categoryFile,
      key
    };
    
    // 更新分类计数
    if (!this.index.categories[category]) {
      this.index.categories[category] = { count: 0 };
    }
    this.index.categories[category].count++;
    
    await this._saveIndex();

    // 更新缓存
    this.cache.set(`${categoryFile}:${key}`, experiences[key]);

    console.log(`✅ 经验已保存: ${fingerprint.id}`);
  }

  /**
   * 滚动合并经验
   * @param {Object} existing - 现有经验
   * @param {Object} newEntry - 新经验
   */
  async merge(existing, newEntry) {
    if (!existing || !newEntry) return;

    // 成功步骤：指数移动平均（近期权重更高）
    for (const step of existing.optimal_steps || []) {
      const match = (newEntry.optimal_steps || []).find(s => 
        this._stepSimilarity(s, step) > 0.8
      );
      
      if (match) {
        step.success_rate = step.success_rate * 0.7 + match.success_rate * 0.3;
        step.avg_token_cost = step.avg_token_cost * 0.7 + match.avg_token_cost * 0.3;
      }
    }

    // 添加新的成功步骤
    for (const newStep of newEntry.optimal_steps || []) {
      const exists = (existing.optimal_steps || []).some(s => 
        this._stepSimilarity(s, newStep) > 0.8
      );
      if (!exists) {
        existing.optimal_steps = existing.optimal_steps || [];
        existing.optimal_steps.push(newStep);
      }
    }

    // 死路：累计计数
    for (const deadEnd of newEntry.dead_ends || []) {
      const exists = (existing.dead_ends || []).find(d => 
        d.description === deadEnd.description
      );
      
      if (exists) {
        exists.fail_count = (exists.fail_count || 1) + 1;
        exists.last_seen = deadEnd.last_seen;
      } else {
        existing.dead_ends = existing.dead_ends || [];
        existing.dead_ends.push({ ...deadEnd, fail_count: 1 });
      }
    }

    // 60天未见 且 失败次数少 → 环境可能变了，移除
    const now = Date.now();
    existing.dead_ends = (existing.dead_ends || []).filter(d => {
      const daysSince = (now - new Date(d.last_seen)) / (1000 * 60 * 60 * 24);
      return !(daysSince > 60 && (d.fail_count || 1) < 3);
    });

    // 更新统计
    existing.stats = existing.stats || {};
    existing.stats.total_executions = (existing.stats.total_executions || 0) + 1;
    existing.stats.last_used = new Date().toISOString();
    existing.updated_at = new Date().toISOString();

    // 保存合并后的经验
    await this.save(existing);

    return existing;
  }

  /**
   * 步骤相似度
   */
  _stepSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    
    // 简单比较描述和方法
    const desc1 = (s1.description || '').toLowerCase();
    const desc2 = (s2.description || '').toLowerCase();
    
    if (desc1 === desc2) return 1.0;
    if (desc1.includes(desc2) || desc2.includes(desc1)) return 0.9;
    
    // 字符级相似度
    const chars1 = new Set(desc1.split(''));
    const chars2 = new Set(desc2.split(''));
    const intersection = new Set([...chars1].filter(c => chars2.has(c)));
    const union = new Set([...chars1, ...chars2]);
    
    return intersection.size / union.size;
  }

  /**
   * 获取分类文件名
   */
  _getCategoryFile(category) {
    const categoryMap = {
      data_extraction: 'data_extraction.json',
      file_operations: 'file_operations.json',
      code_generation: 'code_generation.json',
      system_tasks: 'system_tasks.json',
      image_tasks: 'image_tasks.json',
      video_tasks: 'video_tasks.json'
    };
    
    return categoryMap[category] || 'general.json';
  }

  /**
   * 获取统计报告
   */
  async getStats() {
    try {
      const data = await fs.readFile(STATS_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return { total_experiences: 0, total_token_saved: 0 };
    }
  }

  /**
   * 更新统计报告
   */
  async updateStats(tokenSaved) {
    try {
      const stats = await this.getStats();
      stats.total_experiences = Object.keys(this.index.index).length;
      stats.total_token_saved = (stats.total_token_saved || 0) + tokenSaved;
      stats.updated_at = new Date().toISOString();
      
      await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), 'utf-8');
    } catch (err) {
      // 忽略错误
    }
  }
}

// 单例导出
let storeInstance = null;

async function getExperienceStore() {
  if (!storeInstance) {
    storeInstance = new ExperienceStore();
    await storeInstance.initialize();
  }
  return storeInstance;
}

module.exports = {
  ExperienceStore,
  getExperienceStore
};
