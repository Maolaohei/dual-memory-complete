#!/usr/bin/env node
/**
 * OpenClaw Memory Hook - 简化集成版
 * 一行代码集成到现有 OpenClaw 系统
 * 
 * 使用方法：
 * const { withMemory } = require('./memory-hook-simple');
 * 
 * const response = await withMemory(userMessage, async (context) => {
 *   // 原有的生成逻辑
 *   return await openclaw.generate(context);
 * });
 */

const { MemoryStoreV3 } = require('./memory-store-v3');
const path = require('path');

// 单例模式
let memoryStore = null;
let sessionHistory = [];

/**
 * 获取或初始化记忆存储
 */
async function getMemoryStore() {
  if (!memoryStore) {
    memoryStore = new MemoryStoreV3({
      dbPath: path.join(__dirname, '../lancedb'),
      tableName: 'memories'
    });
    await memoryStore.initialize();
  }
  return memoryStore;
}

/**
 * 带记忆增强的生成函数
 * @param {string} userMessage - 用户输入
 * @param {Function} generateFn - 生成函数，接收增强的上下文
 * @param {Object} options - 配置选项
 */
async function withMemory(userMessage, generateFn, options = {}) {
  const config = {
    retrieveLimit: options.retrieveLimit || 5,
    shortTermRounds: options.shortTermRounds || 8,
    systemPrompt: options.systemPrompt || null,
    autoStore: options.autoStore !== false
  };
  
  const memory = await getMemoryStore();
  
  // 1. 检索相关记忆
  const relevant = await memory.smartRetrieve(userMessage, {
    limit: config.retrieveLimit,
    minConfidence: 0.5
  });
  
  // 2. 压缩近期对话
  const recent = sessionHistory.slice(-config.shortTermRounds);
  const compressed = recent.length > 0 
    ? recent.map(m => `[${m.role}] ${m.content.slice(0, 150)}`).join('\n')
    : null;
  
  // 3. 组装上下文
  const messages = [];
  
  // 系统提示
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  
  // 长期记忆
  if (relevant.results.length > 0) {
    const memories = relevant.results.map(m => m.content).join('\n---\n');
    messages.push({
      role: 'system',
      content: `【相关历史信息】\n${memories.slice(0, 1500)}`
    });
  }
  
  // 短期上下文
  if (compressed) {
    messages.push({
      role: 'system',
      content: `【近期对话】\n${compressed}`
    });
  }
  
  // 用户输入
  messages.push({ role: 'user', content: userMessage });
  
  // 4. 调用生成函数
  const response = await generateFn(messages);
  
  // 5. 记录对话
  sessionHistory.push({ role: 'user', content: userMessage });
  sessionHistory.push({ role: 'assistant', content: response });
  
  // 6. 自动存储高价值信息（简化版：直接存）
  if (config.autoStore) {
    // 判断是否有价值存储
    const shouldStore = 
      userMessage.length > 20 && // 不是太短
      !userMessage.startsWith('谢谢') && // 不是感谢
      !userMessage.startsWith('拜拜'); // 不是告别
    
    if (shouldStore) {
      try {
        await memory.smartStore(
          `用户询问: ${userMessage}\n助手回复: ${response.slice(0, 200)}`,
          {
            type: 'conversation',
            priority: 'P1',
            autoExtracted: true
          }
        );
      } catch (e) {
        // 存储失败不影响主流程
        console.error('自动存储失败:', e.message);
      }
    }
  }
  
  // 限制历史长度
  if (sessionHistory.length > 100) {
    sessionHistory = sessionHistory.slice(-50);
  }
  
  return response;
}

/**
 * 清空会话历史
 */
function clearSession() {
  sessionHistory = [];
}

/**
 * 获取会话统计
 */
function getStats() {
  return {
    sessionRounds: sessionHistory.length / 2,
    memoryInitialized: !!memoryStore
  };
}

module.exports = {
  withMemory,
  clearSession,
  getStats,
  getMemoryStore
};
