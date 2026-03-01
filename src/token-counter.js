/**
 * TokenCounter - Token 计数工具 v6.0
 * 
 * 问题29解决方案：estimate() Token计数函数未定义
 * 
 * 功能：
 * 1. 中文 token 估算（约 1.5 字/token）
 * 2. 英文 token 估算（约 4 字符/token）
 * 3. 消息数组估算
 */

/**
 * 估算文本的 token 数量
 * @param {string|object} input - 输入文本或对象
 * @returns {number} - 估算的 token 数
 */
function estimate(input) {
  if (!input) return 0;
  
  const str = typeof input === 'object' ? JSON.stringify(input) : String(input);
  
  // 统计中文字符（包括 CJK 统一汉字和扩展）
  const chineseChars = (str.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const otherChars = str.length - chineseChars;
  
  // 中文约 1.5字/token，其他约 4字符/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 带警告的估算
 */
function estimateWithWarn(input, label = '') {
  const est = estimate(input);
  if (est > 1000) {
    console.warn(`[TokenCounter] ${label} 估算 ${est} token，注意预算`);
  }
  return est;
}

/**
 * 估算消息数组的 token 数
 * @param {Array} messages - OpenAI 格式的消息数组
 * @returns {number} - 总 token 数
 */
function estimateMessages(messages) {
  if (!Array.isArray(messages)) return 0;
  
  let total = 0;
  
  for (const msg of messages) {
    // 每条消息有固定开销（role + 格式）
    total += 4;
    
    // 内容
    if (msg.content) {
      total += estimate(msg.content);
    }
    
    // name 字段
    if (msg.name) {
      total += estimate(msg.name);
    }
    
    // function_call
    if (msg.function_call) {
      total += estimate(msg.function_call);
    }
  }
  
  // 消息数组的固定开销
  total += 3;
  
  return total;
}

/**
 * 估算 Skill 文件的 token 数
 */
function estimateSkill(skillContent) {
  // Skill 通常包含代码示例，需要更精确估算
  const lines = skillContent.split('\n');
  let total = 0;
  
  for (const line of lines) {
    // 代码行通常 token 密度更高
    if (line.match(/^\s*(\/\/|#|\/\*|\*|```)/)) {
      // 注释行，按普通文本估算
      total += estimate(line);
    } else if (line.match(/[{}\[\]();,.]/)) {
      // 代码行，token 密度更高
      total += Math.ceil(line.length / 3);
    } else {
      // 普通文本
      total += estimate(line);
    }
  }
  
  return total;
}

/**
 * Token 预算检查
 */
function checkBudget(used, budget, label = '') {
  const remaining = budget - used;
  const percentage = (used / budget * 100).toFixed(1);
  
  if (remaining < 0) {
    console.error(`[TokenCounter] ${label} 超预算！已用 ${used}/${budget} (${percentage}%)`);
    return { ok: false, over: -remaining };
  }
  
  if (remaining < budget * 0.1) {
    console.warn(`[TokenCounter] ${label} 接近预算上限：${used}/${budget} (${percentage}%)`);
  }
  
  return { ok: true, remaining };
}

/**
 * 裁剪文本到指定 token 预算
 */
function trimToBudget(text, maxTokens) {
  const currentTokens = estimate(text);
  if (currentTokens <= maxTokens) return text;
  
  // 估算需要保留的字符数
  const ratio = maxTokens / currentTokens;
  const targetChars = Math.floor(text.length * ratio * 0.9); // 留 10% 余量
  
  // 在句子边界截断
  let truncated = text.slice(0, targetChars);
  
  // 找最后一个句子结束符
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('\n')
  );
  
  if (lastPeriod > targetChars * 0.6) {
    truncated = truncated.slice(0, lastPeriod + 1);
  }
  
  return truncated + '...';
}

module.exports = {
  estimate,
  estimateWithWarn,
  estimateMessages,
  estimateSkill,
  checkBudget,
  trimToBudget
};