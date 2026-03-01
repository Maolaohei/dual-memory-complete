/**
 * TaskTracker - 任务执行追踪
 * 
 * 功能：
 * 1. 记录每步执行
 * 2. 追踪 token 消耗
 * 3. 提炼经验结论
 * 4. 计算节省量
 */

const { getExperienceStore } = require('./store');

class TaskTracker {
  constructor(fingerprint) {
    this.fingerprint = fingerprint;
    this.steps = [];
    this.startTime = Date.now();
    this.totalTokens = 0;
  }

  /**
   * 记录步骤
   * @param {string} description - 步骤描述
   * @param {string} method - 使用方法
   * @param {string} outcome - 结果 (success/failed/skipped)
   * @param {number} tokenCost - token 消耗
   */
  recordStep(description, method, outcome, tokenCost = 0) {
    this.steps.push({
      description,
      method,
      outcome,
      tokenCost,
      timestamp: Date.now()
    });
    this.totalTokens += tokenCost;
  }

  /**
   * 记录成功步骤
   */
  recordSuccess(description, method, tokenCost = 0) {
    this.recordStep(description, method, 'success', tokenCost);
  }

  /**
   * 记录失败步骤
   */
  recordFailure(description, method, error, tokenCost = 0) {
    this.recordStep(description, method, 'failed', tokenCost);
    this.steps[this.steps.length - 1].error = error;
  }

  /**
   * 记录跳过步骤
   */
  recordSkip(description, reason, tokenCost = 0) {
    this.recordStep(description, 'skipped', 'skipped', tokenCost);
    this.steps[this.steps.length - 1].reason = reason;
  }

  /**
   * 完成追踪，保存经验
   * @param {boolean} success - 任务是否成功
   */
  async finalize(success) {
    const experience = this._extract(success, this.totalTokens);
    
    if (!experience) return null;

    // 获取经验存储
    const store = await getExperienceStore();
    
    // 检查是否有旧经验
    const existing = await store.findBest(this.fingerprint);
    
    if (existing && existing.matchType === 'exact') {
      // 合并经验
      await store.merge(existing, experience);
    } else {
      // 保存新经验
      await store.save(experience);
    }

    // 计算节省量
    const savings = this._calcSavings(existing, this.totalTokens);
    
    if (savings > 0) {
      console.log(`[Optimizer] 本次节省 ${savings} token`);
      await store.updateStats(savings);
    }

    return {
      experience,
      savings,
      totalTokens: this.totalTokens,
      duration: Date.now() - this.startTime
    };
  }

  /**
   * 提炼经验
   */
  _extract(success, totalTokens) {
    if (!this.fingerprint) return null;

    return {
      fingerprint: this.fingerprint,
      optimal_steps: success
        ? this.steps
            .filter(s => s.outcome === 'success')
            .map(s => ({
              description: s.description,
              method: s.method,
              avg_token_cost: s.tokenCost,
              success_rate: 1.0
            }))
        : [],
      dead_ends: this.steps
        .filter(s => s.outcome === 'failed')
        .map(s => ({
          description: s.description,
          reason: s.error || '未知错误',
          token_wasted_per_attempt: s.tokenCost,
          last_seen: new Date().toISOString()
        })),
      stats: {
        total_token_cost: totalTokens,
        success,
        total_executions: 1,
        last_used: new Date().toISOString()
      }
    };
  }

  /**
   * 计算节省量
   */
  _calcSavings(existing, currentTokens) {
    if (!existing) return 0;

    // 计算旧经验的平均 token 消耗
    const oldAvgCost = existing.optimal_steps?.reduce(
      (sum, s) => sum + (s.avg_token_cost || 0), 0
    ) || 0;

    // 如果有死路被跳过，计算节省
    const deadEndSavings = this.steps
      .filter(s => s.outcome === 'skipped')
      .reduce((sum, s) => {
        const deadEnd = existing.dead_ends?.find(
          d => d.description === s.description
        );
        return sum + (deadEnd?.token_wasted_per_attempt || 0);
      }, 0);

    // 总节省 = 死路节省 + (旧平均 - 当前消耗)
    const savings = deadEndSavings + Math.max(0, oldAvgCost - currentTokens);
    
    return Math.round(savings);
  }

  /**
   * 获取追踪摘要
   */
  getSummary() {
    return {
      fingerprint: this.fingerprint?.id,
      totalSteps: this.steps.length,
      successSteps: this.steps.filter(s => s.outcome === 'success').length,
      failedSteps: this.steps.filter(s => s.outcome === 'failed').length,
      skippedSteps: this.steps.filter(s => s.outcome === 'skipped').length,
      totalTokens: this.totalTokens,
      duration: Date.now() - this.startTime
    };
  }
}

module.exports = { TaskTracker };
