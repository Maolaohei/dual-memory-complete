/**
 * SafeLLMJson - LLM JSON 解析容错工具
 * 
 * 问题21解决方案：LLM 输出解析无容错
 * 
 * 功能：
 * 1. 清理 LLM 返回的格式问题（markdown代码块、解释文字）
 * 2. 重试机制
 * 3. 降级默认值，不崩溃
 */

const MAX_RETRIES = 2;

/**
 * 安全解析 LLM 返回的 JSON
 * @param {string} raw - LLM 原始输出
 * @param {*} fallback - 解析失败时的降级值
 * @param {number} retries - 重试次数
 * @returns {*} - 解析结果或降级值
 */
function safeParseJson(raw, fallback = null, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      if (!raw || typeof raw !== 'string') {
        return fallback;
      }

      // 清理常见的 LLM 格式问题
      let cleaned = raw
        .replace(/```json\n?/g, '')   // 去掉 markdown 代码块
        .replace(/```\n?/g, '')
        .replace(/^[^{[]*/, '')       // 去掉开头的解释文字
        .replace(/[^}\]]*$/, '')      // 去掉结尾的解释文字
        .trim();

      // 尝试提取 JSON 对象或数组
      const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      return JSON.parse(cleaned);
    } catch (e) {
      if (i === retries) {
        console.error(`[SafeParse] JSON解析失败，使用降级值:`, e.message);
        console.error(`[SafeParse] 原始内容:`, raw.slice(0, 200));
        return fallback;
      }
      console.warn(`[SafeParse] 第${i + 1}次解析失败，重试...`);
    }
  }
  return fallback;
}

/**
 * 带 LLM 调用的安全 JSON 解析
 * @param {Function} llmComplete - LLM complete 函数
 * @param {string} prompt - 提示词
 * @param {*} fallback - 降级值
 * @param {number} retries - 重试次数
 * @returns {Promise<*>} - 解析结果
 */
async function safeLLMJson(llmComplete, prompt, fallback = null, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const raw = await llmComplete(prompt);
      return safeParseJson(raw, fallback, 0); // 内部不再重试
    } catch (e) {
      if (i === retries) {
        console.error(`[SafeLLMJson] LLM调用或解析失败，使用降级值:`, e.message);
        return fallback;
      }
      console.warn(`[SafeLLMJson] 第${i + 1}次失败，重试...`);
    }
  }
  return fallback;
}

/**
 * 提取 JSON 数组
 */
function extractJsonArray(raw, fallback = []) {
  const result = safeParseJson(raw, fallback);
  if (Array.isArray(result)) {
    return result;
  }
  // 如果返回的是对象，尝试提取数组字段
  if (result && typeof result === 'object') {
    for (const key of ['items', 'data', 'results', 'skills', 'triggers']) {
      if (Array.isArray(result[key])) {
        return result[key];
      }
    }
  }
  return fallback;
}

/**
 * 提取 JSON 对象
 */
function extractJsonObject(raw, fallback = {}) {
  const result = safeParseJson(raw, fallback);
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result;
  }
  return fallback;
}

module.exports = {
  safeParseJson,
  safeLLMJson,
  extractJsonArray,
  extractJsonObject
};