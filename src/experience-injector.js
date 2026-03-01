/**
 * ExperienceInjector - 经验分级注入 v6.0
 * 
 * 功能：
 * 1. 根据置信度分级注入经验提示
 * 2. 高置信度(≥0.85): 完整步骤
 * 3. 中置信度(0.60-0.85): 关键提示
 * 4. 低置信度(<0.60): 仅提示存在
 * 
 * Token 预算: 50~80 token
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// 从 optimizations.json 加载阈值
const DEFAULT_THRESHOLDS = {
  high: 0.85,
  medium: 0.60,
  low: 0.40
};

class ExperienceInjector {
  constructor(options = {}) {
    this.experiencesDir = options.experiencesDir || path.resolve(__dirname, '../data/experiences');
    this.thresholds = options.thresholds || DEFAULT_THRESHOLDS;
    this.maxTokens = options.maxTokens || 80;
  }

  /**
   * 注入经验提示
   * @param {string} taskType - 任务类型
   * @param {number} confidence - 置信度
   * @param {Object} experience - 经验数据
   * @returns {Object} - { hint: 提示文本, level: 级别, tokens: 估算token }
   */
  inject(taskType, confidence, experience) {
    if (!experience || confidence < this.thresholds.low) {
      return null;
    }

    let hint = '';
    let level = '';

    if (confidence >= this.thresholds.high) {
      // 高置信度：完整步骤
      level = 'high';
      hint = this._formatHighConfidence(taskType, experience);
    } else if (confidence >= this.thresholds.medium) {
      // 中置信度：关键提示
      level = 'medium';
      hint = this._formatMediumConfidence(taskType, experience);
    } else {
      // 低置信度：仅提示存在
      level = 'low';
      hint = this._formatLowConfidence(taskType, experience);
    }

    // 确保 token 不超限
    hint = this._trimToBudget(hint, this.maxTokens);

    return {
      hint,
      level,
      confidence,
      tokens: this._estimateTokens(hint)
    };
  }

  /**
   * 高置信度格式：完整步骤
   */
  _formatHighConfidence(taskType, experience) {
    const steps = experience.steps || experience.stats?.topPattern || '';
    
    if (typeof steps === 'string') {
      return `【${taskType}】推荐步骤: ${steps}`;
    }

    if (Array.isArray(steps)) {
      return `【${taskType}】推荐步骤:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }

    return `【${taskType}】${experience.hint || '有相关经验可用'}`;
  }

  /**
   * 中置信度格式：关键提示
   */
  _formatMediumConfidence(taskType, experience) {
    const keyPoint = experience.hint || experience.stats?.topPattern || '有相关经验';
    return `【${taskType}】提示: ${keyPoint.slice(0, 50)}`;
  }

  /**
   * 低置信度格式：仅提示存在
   */
  _formatLowConfidence(taskType, experience) {
    return `【${taskType}】有历史记录可参考`;
  }

  /**
   * 裁剪到预算内
   */
  _trimToBudget(text, maxTokens) {
    const tokens = this._estimateTokens(text);
    if (tokens <= maxTokens) return text;

    // 估算需要保留的字符数
    const avgCharsPerToken = text.length / tokens;
    const targetChars = Math.floor(maxTokens * avgCharsPerToken * 0.9);

    // 在句子边界截断
    const truncated = text.slice(0, targetChars);
    const lastPeriod = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('\n')
    );

    if (lastPeriod > targetChars * 0.6) {
      return truncated.slice(0, lastPeriod + 1);
    }

    return truncated + '...';
  }

  /**
   * 估算 token 数量
   */
  _estimateTokens(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 从文件加载经验
   */
  async loadExperience(taskType) {
    const expPath = path.join(this.experiencesDir, `${taskType}.json`);
    
    if (!fsSync.existsSync(expPath)) {
      return null;
    }

    try {
      const data = await fs.readFile(expPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  /**
   * 保存经验
   */
  async saveExperience(taskType, experience) {
    // 确保目录存在
    if (!fsSync.existsSync(this.experiencesDir)) {
      await fs.mkdir(this.experiencesDir, { recursive: true });
    }

    const expPath = path.join(this.experiencesDir, `${taskType}.json`);
    experience.updated_at = new Date().toISOString();
    
    await fs.writeFile(expPath, JSON.stringify(experience, null, 2), 'utf-8');
  }

  /**
   * 批量注入多个经验
   */
  injectMultiple(experiences) {
    const results = [];
    let totalTokens = 0;
    const maxTotal = this.maxTokens * 2; // 最多160 token

    for (const exp of experiences) {
      if (totalTokens >= maxTotal) break;

      const injected = this.inject(exp.taskType, exp.confidence, exp.experience);
      if (injected) {
        results.push(injected);
        totalTokens += injected.tokens;
      }
    }

    return {
      hints: results,
      totalTokens,
      count: results.length
    };
  }

  /**
   * 获取经验统计
   */
  getStats() {
    if (!fsSync.existsSync(this.experiencesDir)) {
      return { count: 0, experiences: [] };
    }

    const files = fsSync.readdirSync(this.experiencesDir)
      .filter(f => f.endsWith('.json'));

    const experiences = files.map(f => {
      const data = JSON.parse(fsSync.readFileSync(path.join(this.experiencesDir, f), 'utf-8'));
      return {
        taskType: f.replace('.json', ''),
        confidence: data.confidence,
        updated_at: data.updated_at
      };
    });

    return {
      count: experiences.length,
      experiences
    };
  }
}

module.exports = { ExperienceInjector };