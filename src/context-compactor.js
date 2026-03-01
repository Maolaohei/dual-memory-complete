/**
 * ContextCompactor - 上下文压缩器 v6.0
 * 
 * 当上下文超过阈值时，自动压缩对话历史
 * 保留最近10轮 + 用户指令 + 关键决策
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// 压缩阈值
const COMPACT_THRESHOLD = 100000; // 100k tokens
const KEEP_RECENT_TURNS = 10;

class ContextCompactor {
  constructor(options = {}) {
    this.historyPath = options.historyPath || path.resolve(__dirname, '../../memory/HISTORY.md');
    this.threshold = options.threshold || COMPACT_THRESHOLD;
    this.keepTurns = options.keepTurns || KEEP_RECENT_TURNS;
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompact(currentTokens) {
    return currentTokens > this.threshold;
  }

  /**
   * 压缩对话历史
   * @param {Array} messages - 对话消息数组
   * @returns {Object} - { compacted: 压缩后的消息, summary: 摘要 }
   */
  async compact(messages) {
    if (messages.length <= this.keepTurns * 2) {
      return { compacted: messages, summary: null };
    }

    // 1. 分离保留部分和压缩部分
    const keepCount = this.keepTurns * 2; // 每轮包含 user + assistant
    const toCompress = messages.slice(0, -keepCount);
    const toKeep = messages.slice(-keepCount);

    if (toCompress.length === 0) {
      return { compacted: messages, summary: null };
    }

    // 2. 提取关键信息
    const summary = await this._extractSummary(toCompress);

    // 3. 写入历史文件
    await this._appendToHistory(toCompress, summary);

    // 4. 返回压缩后的消息
    return {
      compacted: [
        {
          role: 'system',
          content: `[历史摘要] ${summary}`
        },
        ...toKeep
      ],
      summary,
      compressedCount: toCompress.length
    };
  }

  /**
   * 提取摘要（简单版，不调用LLM）
   */
  async _extractSummary(messages) {
    const keyPoints = [];

    for (const msg of messages) {
      // 提取用户指令
      if (msg.role === 'user') {
        const content = msg.content || '';
        // 检测关键指令
        if (content.includes('搜索') || content.includes('查找')) {
          keyPoints.push(`搜索任务: ${content.slice(0, 50)}...`);
        } else if (content.includes('下载')) {
          keyPoints.push(`下载任务: ${content.slice(0, 50)}...`);
        } else if (content.includes('提醒')) {
          keyPoints.push(`提醒任务: ${content.slice(0, 50)}...`);
        }
      }

      // 提取关键决策
      if (msg.role === 'assistant') {
        const content = msg.content || '';
        if (content.includes('✅') || content.includes('完成')) {
          keyPoints.push(`完成: ${content.slice(0, 30)}...`);
        }
      }
    }

    // 去重并限制数量
    const uniquePoints = [...new Set(keyPoints)].slice(0, 5);

    if (uniquePoints.length === 0) {
      return `压缩了 ${messages.length} 条消息`;
    }

    return uniquePoints.join(' | ');
  }

  /**
   * 追加到历史文件
   */
  async _appendToHistory(messages, summary) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.slice(0, 10);
    const timeStr = timestamp.slice(11, 19);

    let content = `\n\n## [${dateStr} ${timeStr}] 上下文压缩\n\n`;
    content += `**摘要**: ${summary}\n\n`;
    content += `**压缩消息数**: ${messages.length}\n\n`;
    content += `---\n`;

    // 确保目录存在
    const dir = path.dirname(this.historyPath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.appendFile(this.historyPath, content, 'utf-8');
  }

  /**
   * 获取压缩统计
   */
  getStats(messages) {
    const totalMessages = messages.length;
    const totalTokens = this._estimateTokens(messages);
    const needsCompact = this.shouldCompact(totalTokens);

    return {
      totalMessages,
      totalTokens,
      threshold: this.threshold,
      needsCompact,
      potentialSavings: needsCompact ? totalTokens - this.threshold : 0
    };
  }

  /**
   * 估算 token 数量
   */
  _estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = msg.content || '';
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = content.length - chineseChars;
      total += Math.ceil(chineseChars / 1.5 + otherChars / 4);
    }
    return total;
  }
}

module.exports = { ContextCompactor };