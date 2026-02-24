#!/usr/bin/env node
/**
 * OpenClaw Memory Bridge
 * 让 dual-memory 成为 OpenClaw 的"本能"
 * 
 * 集成方式：将此文件配置为 OpenClaw 的 pre-process hook
 */

const { spawn } = require('child_process');
const path = require('path');

const DUAL_MEMORY_PATH = path.join(process.env.HOME || '/root', '.openclaw/workspace/skills/dual-memory');

// 内存 hook 实例
let memoryModule = null;

async function loadMemory() {
  if (memoryModule) return memoryModule;
  
  try {
    const mod = require(path.join(DUAL_MEMORY_PATH, 'src/memory-hook-simple.js'));
    memoryModule = mod;
    return mod;
  } catch (e) {
    console.error('[Memory Bridge] 加载失败:', e.message);
    return null;
  }
}

/**
 * 处理传入的消息
 * 这会被 OpenClaw 调用
 */
async function processMessage(userMessage, context = {}) {
  const memory = await loadMemory();
  
  if (!memory || !memory.withMemory) {
    // Memory 不可用，直接返回原消息
    return {
      enhanced: false,
      messages: [{ role: 'user', content: userMessage }]
    };
  }
  
  // 使用 memory hook 处理
  let enhancedContext = null;
  
  await memory.withMemory(
    userMessage,
    async (messages) => {
      enhancedContext = messages;
      return "processed"; // dummy return
    },
    {
      systemPrompt: context.systemPrompt,
      retrieveLimit: 5,
      shortTermRounds: 10,
      autoStore: true
    }
  );
  
  return {
    enhanced: true,
    messages: enhancedContext,
    metadata: {
      hasLongTerm: enhancedContext.some(m => 
        m.role === 'system' && m.content.includes('历史')
      ),
      hasShortTerm: enhancedContext.some(m => 
        m.role === 'system' && m.content.includes('对话')
      )
    }
  };
}

/**
 * 存储对话结果
 */
async function storeConversation(userMessage, assistantReply, metadata = {}) {
  const memory = await loadMemory();
  if (!memory || !memory.getMemoryStore) return;
  
  try {
    const store = await memory.getMemoryStore();
    await store.addMemory(
      `[对话] 用户: ${userMessage.slice(0, 200)}\n助手: ${assistantReply.slice(0, 200)}`,
      {
        type: 'conversation',
        priority: 'P1',
        ...metadata
      }
    );
  } catch (e) {
    // 静默失败，不影响主流程
  }
}

// CLI 入口
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'process') {
    // 处理模式
    let input = '';
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', async () => {
      try {
        const data = JSON.parse(input);
        const result = await processMessage(data.message, data.context);
        console.log(JSON.stringify(result));
      } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
        process.exit(1);
      }
    });
  } else if (command === 'store') {
    // 存储模式
    let input = '';
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', async () => {
      try {
        const data = JSON.parse(input);
        await storeConversation(data.user, data.assistant, data.metadata);
        console.log(JSON.stringify({ stored: true }));
      } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
      }
    });
  } else if (command === 'test') {
    // 测试模式
    console.log('🧠 Memory Bridge 测试');
    console.log('====================');
    
    loadMemory().then(async (mem) => {
      if (mem) {
        console.log('✅ Memory 模块已加载');
        console.log('📊 会话统计:', mem.getStats?.() || 'N/A');
      } else {
        console.log('❌ Memory 模块加载失败');
      }
    });
  } else {
    console.log('OpenClaw Memory Bridge');
    console.log('用法:');
    console.log('  node memory-bridge.js process < input.json');
    console.log('  node memory-bridge.js store < input.json');
    console.log('  node memory-bridge.js test');
  }
}

module.exports = {
  processMessage,
  storeConversation,
  loadMemory
};
