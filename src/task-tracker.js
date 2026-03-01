/**
 * TaskTracker - 任务执行追踪 v6.0
 * 
 * 功能：
 * 1. 记录任务执行过程
 * 2. 提取成功/失败模式
 * 3. 生成经验提示
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class TaskTracker {
  constructor(options = {}) {
    this.logPath = options.logPath || path.resolve(__dirname, '../data/task_log.jsonl');
    this.maxLogSize = options.maxLogSize || 1000; // 最多保留1000条
  }

  /**
   * 开始追踪任务
   */
  startTask(taskId, taskType, input) {
    return {
      taskId,
      taskType,
      input: this._truncate(input, 200),
      startTime: Date.now(),
      steps: [],
      status: 'running'
    };
  }

  /**
   * 记录步骤
   */
  recordStep(task, stepName, stepData = {}) {
    task.steps.push({
      name: stepName,
      data: this._truncate(stepData, 100),
      time: Date.now()
    });
    return task;
  }

  /**
   * 完成任务
   */
  async completeTask(task, result) {
    task.status = 'success';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.result = this._truncate(result, 200);

    await this._appendLog(task);
    return task;
  }

  /**
   * 任务失败
   */
  async failTask(task, error) {
    task.status = 'failed';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.error = error.message || String(error);

    await this._appendLog(task);
    return task;
  }

  /**
   * 追加日志
   */
  async _appendLog(task) {
    // 确保目录存在
    const dir = path.dirname(this.logPath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    const logLine = JSON.stringify(task) + '\n';
    await fs.appendFile(this.logPath, logLine, 'utf-8');

    // 检查日志大小，必要时清理
    await this._rotateLogIfNeeded();
  }

  /**
   * 日志轮转
   */
  async _rotateLogIfNeeded() {
    if (!fsSync.existsSync(this.logPath)) return;

    const stats = fsSync.statSync(this.logPath);
    const lines = fsSync.readFileSync(this.logPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    if (lines.length > this.maxLogSize) {
      // 保留最近的一半
      const keepLines = lines.slice(-Math.floor(this.maxLogSize / 2));
      await fs.writeFile(this.logPath, keepLines.join('\n') + '\n', 'utf-8');
      console.log(`  🔄 任务日志已轮转，保留 ${keepLines.length} 条`);
    }
  }

  /**
   * 分析任务模式
   */
  async analyzePatterns(taskType = null, limit = 100) {
    if (!fsSync.existsSync(this.logPath)) {
      return { success: [], failed: [] };
    }

    const lines = fsSync.readFileSync(this.logPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .slice(-limit);

    const tasks = lines.map(l => JSON.parse(l));

    // 按类型过滤
    const filtered = taskType 
      ? tasks.filter(t => t.taskType === taskType)
      : tasks;

    // 分析成功模式
    const successTasks = filtered.filter(t => t.status === 'success');
    const failedTasks = filtered.filter(t => t.status === 'failed');

    // 提取常见步骤
    const successPatterns = this._extractPatterns(successTasks);
    const failurePatterns = this._extractPatterns(failedTasks);

    return {
      total: filtered.length,
      success: successTasks.length,
      failed: failedTasks.length,
      successPatterns,
      failurePatterns
    };
  }

  /**
   * 提取步骤模式
   */
  _extractPatterns(tasks) {
    const stepCounts = {};

    for (const task of tasks) {
      const stepNames = task.steps.map(s => s.name).join(' → ');
      stepCounts[stepNames] = (stepCounts[stepNames] || 0) + 1;
    }

    return Object.entries(stepCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  /**
   * 生成经验提示
   */
  async generateExperienceHint(taskType) {
    const patterns = await this.analyzePatterns(taskType);

    if (patterns.successPatterns.length === 0) {
      return null;
    }

    const topPattern = patterns.successPatterns[0];
    const successRate = patterns.total > 0 
      ? (patterns.success / patterns.total * 100).toFixed(0)
      : 0;

    return {
      hint: `${taskType} 成功率 ${successRate}%，推荐步骤: ${topPattern.pattern}`,
      confidence: Math.min(0.9, patterns.success / 10 * 0.1 + 0.5),
      stats: {
        total: patterns.total,
        success: patterns.success,
        topPattern: topPattern.pattern
      }
    };
  }

  /**
   * 截断字符串
   */
  _truncate(obj, maxLen) {
    if (typeof obj === 'string') {
      return obj.length > maxLen ? obj.slice(0, maxLen) + '...' : obj;
    }
    if (typeof obj === 'object' && obj !== null) {
      const str = JSON.stringify(obj);
      return str.length > maxLen ? str.slice(0, maxLen) + '...' : obj;
    }
    return obj;
  }

  /**
   * 获取最近任务
   */
  getRecentTasks(limit = 10) {
    if (!fsSync.existsSync(this.logPath)) {
      return [];
    }

    const lines = fsSync.readFileSync(this.logPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .slice(-limit);

    return lines.map(l => JSON.parse(l));
  }
}

module.exports = { TaskTracker };