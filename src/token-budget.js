/**
 * Token 预算管理模块 v5.0
 * 防止上下文窗口溢出，确保核心信息优先
 * 
 * 新增功能：
 * - 从 optimizations.json 读取配置
 * - 支持经验提示预算
 * - 更严格的预算限制（2600 token 硬限制）
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// 默认预算配置（v5.0 更严格）
const DEFAULT_BUDGET = {
  core_files: 300,       // SOUL_CORE.md（最小核心）
  retrieved_memory: 500, // 检索到的记忆
  experience_hint: 80,   // 经验提示（分级注入）
  conversation: 1500,    // 对话历史
  system_prompt: 200,    // 系统提示
  reserve: 100           // 预留
  // 总计: ~2680 token（更严格）
};

// 运行时预算
let TOKEN_BUDGET = { ...DEFAULT_BUDGET };
let configLoaded = false;

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
 * 从 optimizations.json 加载预算配置
 */
async function loadBudgetConfig() {
  if (configLoaded) return TOKEN_BUDGET;
  
  const configPath = path.resolve(__dirname, '../../memory/optimizations.json');
  
  try {
    if (fsSync.existsSync(configPath)) {
      const data = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(data);
      
      if (config.token_budget?.limits) {
        TOKEN_BUDGET = { ...DEFAULT_BUDGET, ...config.token_budget.limits };
        console.log('✅ Token 预算配置已加载:', TOKEN_BUDGET);
      }
    }
  } catch (err) {
    console.warn('⚠️ 加载预算配置失败，使用默认值:', err.message);
  }
  
  configLoaded = true;
  return TOKEN_BUDGET;
}

/**
 * 同步加载预算配置（用于初始化）
 */
function loadBudgetConfigSync() {
  if (configLoaded) return TOKEN_BUDGET;
  
  const configPath = path.resolve(__dirname, '../../memory/optimizations.json');
  
  try {
    if (fsSync.existsSync(configPath)) {
      const data = fsSync.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      
      if (config.token_budget?.limits) {
        TOKEN_BUDGET = { ...DEFAULT_BUDGET, ...config.token_budget.limits };
      }
    }
  } catch (err) {
    // 使用默认值
  }
  
  configLoaded = true;
  return TOKEN_BUDGET;
}

/**
 * 获取当前预算配置
 */
function getBudget() {
  if (!configLoaded) {
    loadBudgetConfigSync();
  }
  return { ...TOKEN_BUDGET };
}

/**
 * 构建上下文，确保不超过预算
 * v5.0 更新：支持经验提示
 */
function buildContext(options = {}) {
  // 确保配置已加载
  if (!configLoaded) {
    loadBudgetConfigSync();
  }
  
  const {
    soul = '',           // SOUL_CORE.md
    memories = [],       // 检索到的记忆
    experience = null,   // 经验提示
    history = '',        // 对话历史
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

  // 2. SOUL_CORE（核心人格，最高优先级）
  if (soul) {
    const tokens = estimateTokens(soul);
    if (tokens <= budget.core_files) {
      parts.push({ type: 'soul', content: soul, tokens });
      totalTokens += tokens;
    } else {
      // 截断（不应该发生，SOUL_CORE 应该 ≤300 token）
      const truncated = truncateText(soul, budget.core_files);
      parts.push({ type: 'soul', content: truncated, tokens: estimateTokens(truncated) });
      totalTokens += estimateTokens(truncated);
    }
  }

  // 3. 经验提示（分级注入，50~80 token）
  if (experience && experience.hint) {
    const tokens = estimateTokens(experience.hint);
    if (tokens <= budget.experience_hint) {
      parts.push({ type: 'experience', content: experience.hint, tokens, confidence: experience.confidence });
      totalTokens += tokens;
    }
  }

  // 4. 检索到的记忆（按评分排序，超预算截止）
  const sortedMemories = [...memories].sort((a, b) => 
    (b.effective_confidence || 0) - (a.effective_confidence || 0)
  );

  const memoryParts = [];
  let memoryTokens = 0;

  for (const mem of sortedMemories) {
    const tokens = estimateTokens(mem.content || mem.metadata?.content || '');
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

  // 5. 对话历史（最低优先级）
  if (history) {
    const tokens = estimateTokens(history);
    const remainingBudget = budget.conversation + budget.reserve - 
      Math.max(0, totalTokens - budget.core_files - budget.system_prompt - budget.experience_hint);
    
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
 * v5.0 新增：计算并裁剪上下文
 * 返回裁剪后的结果，确保不超过预算
 */
function calculate(options = {}) {
  const result = buildContext(options);
  
  // 返回裁剪后的各部分
  return {
    soul: result.parts.find(p => p.type === 'soul')?.content || '',
    memories: result.parts.find(p => p.type === 'memory')?.content || [],
    experience: result.parts.find(p => p.type === 'experience')?.content || null,
    history: result.parts.find(p => p.type === 'history')?.content || '',
    tokenUsage: {
      total: result.totalTokens,
      breakdown: result.parts.reduce((acc, p) => {
        acc[p.type] = p.tokens;
        return acc;
      }, {})
    }
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
  DEFAULT_BUDGET,
  estimateTokens,
  loadBudgetConfig,
  loadBudgetConfigSync,
  getBudget,
  buildContext,
  calculate,
  truncateText,
  shouldCompress,
  getBudgetReport
};
