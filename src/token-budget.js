/**
 * Token 预算管理模块
 * 防止上下文窗口溢出，确保核心信息优先
 */

const TOKEN_BUDGET = {
  core_files: 800,       // 核心文件（精简后）
  retrieved_memory: 600, // 检索到的记忆
  conversation: 1500,    // 对话历史
  system_prompt: 300,    // 系统提示
  reserve: 200           // 预留
  // 总计: ~3400 token
};

/**
 * 估算文本的 token 数量
 * 简单估算：中文约 1.5 字/token，英文约 4 字符/token
 */
function estimateTokens(text) {
  if (!text) return 0;
  
  // 区分中英文
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  
  // 中文约 1.5 字/token，英文约 4 字符/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 构建上下文，确保不超过预算
 */
function buildContext(options = {}) {
  const {
    coreInfo = '',
    memories = [],
    history = '',
    systemPrompt = ''
  } = options;

  let totalTokens = 0;
  const parts = [];
  const budget = { ...TOKEN_BUDGET };

  // 1. 系统提示（最高优先级）
  if (systemPrompt) {
    const tokens = estimateTokens(systemPrompt);
    if (tokens <= budget.system_prompt) {
      parts.push({ type: 'system', content: systemPrompt, tokens });
      totalTokens += tokens;
    }
  }

  // 2. 核心信息（高优先级）
  if (coreInfo) {
    const tokens = estimateTokens(coreInfo);
    if (totalTokens + tokens <= budget.core_files + budget.reserve) {
      parts.push({ type: 'core', content: coreInfo, tokens });
      totalTokens += tokens;
    } else {
      // 截断核心信息
      const maxTokens = budget.core_files - (totalTokens - budget.reserve);
      const truncated = truncateText(coreInfo, maxTokens);
      parts.push({ type: 'core', content: truncated, tokens: estimateTokens(truncated) });
      totalTokens += estimateTokens(truncated);
    }
  }

  // 3. 检索到的记忆（按评分排序，超预算截止）
  const sortedMemories = [...memories].sort((a, b) => 
    (b.effective_confidence || 0) - (a.effective_confidence || 0)
  );

  const memoryParts = [];
  let memoryTokens = 0;

  for (const mem of sortedMemories) {
    const tokens = estimateTokens(mem.content);
    if (memoryTokens + tokens <= budget.retrieved_memory) {
      memoryParts.push(mem);
      memoryTokens += tokens;
    } else {
      break; // 超预算截止
    }
  }

  if (memoryParts.length > 0) {
    parts.push({ type: 'memory', content: memoryParts, tokens: memoryTokens });
    totalTokens += memoryTokens;
  }

  // 4. 对话历史（最低优先级）
  if (history) {
    const tokens = estimateTokens(history);
    const remainingBudget = budget.conversation + budget.reserve - 
      Math.max(0, totalTokens - budget.core_files - budget.system_prompt);
    
    if (tokens <= remainingBudget) {
      parts.push({ type: 'history', content: history, tokens });
      totalTokens += tokens;
    } else {
      // 截断历史
      const truncated = truncateText(history, remainingBudget);
      parts.push({ type: 'history', content: truncated, tokens: estimateTokens(truncated) });
      totalTokens += estimateTokens(truncated);
    }
  }

  return {
    parts,
    totalTokens,
    budget: TOKEN_BUDGET,
    utilization: (totalTokens / Object.values(TOKEN_BUDGET).reduce((a, b) => a + b, 0) * 100).toFixed(1) + '%'
  };
}

/**
 * 截断文本到指定 token 数量
 */
function truncateText(text, maxTokens) {
  if (!text) return '';
  
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) return text;
  
  // 估算需要保留的字符数
  const avgCharsPerToken = text.length / estimatedTokens;
  const targetChars = Math.floor(maxTokens * avgCharsPerToken * 0.9); // 留 10% 余量
  
  // 尝试在句子边界截断
  const truncated = text.slice(0, targetChars);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('\n')
  );
  
  if (lastPeriod > targetChars * 0.7) {
    return truncated.slice(0, lastPeriod + 1);
  }
  
  return truncated + '...';
}

/**
 * 检查是否需要压缩上下文
 */
function shouldCompress(currentTokens, threshold = 0.8) {
  const maxTokens = Object.values(TOKEN_BUDGET).reduce((a, b) => a + b, 0);
  return currentTokens / maxTokens > threshold;
}

/**
 * 获取预算使用报告
 */
function getBudgetReport(currentUsage = {}) {
  const report = {
    budget: TOKEN_BUDGET,
    usage: {},
    warnings: []
  };

  for (const [key, limit] of Object.entries(TOKEN_BUDGET)) {
    const used = currentUsage[key] || 0;
    report.usage[key] = {
      used,
      limit,
      percentage: (used / limit * 100).toFixed(1) + '%',
      status: used > limit ? '❌ 超限' : used > limit * 0.8 ? '⚠️ 接近上限' : '✅ 正常'
    };

    if (used > limit) {
      report.warnings.push(`${key} 超出预算 ${used - limit} tokens`);
    }
  }

  return report;
}

module.exports = {
  TOKEN_BUDGET,
  estimateTokens,
  buildContext,
  truncateText,
  shouldCompress,
  getBudgetReport
};
