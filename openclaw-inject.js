#!/usr/bin/env node
/**
 * OpenClaw Memory Hook 注入器
 * 通过 Node.js --require 预加载，拦截 OpenClaw 的处理流程
 */

const Module = require('module');
const path = require('path');

const DUAL_MEMORY_PATH = path.join(process.env.HOME || '/root', '.openclaw/workspace/skills/dual-memory');

// 延迟加载，避免启动时出错
let memoryHook = null;
let memoryStore = null;

async function initMemory() {
  if (memoryHook) return;
  
  try {
    const { withMemory, getMemoryStore } = require(path.join(DUAL_MEMORY_PATH, 'src/memory-hook-simple.js'));
    memoryHook = withMemory;
    memoryStore = await getMemoryStore();
    console.log('🧠 [Memory Hook] 已激活');
  } catch (e) {
    console.error('⚠️  [Memory Hook] 加载失败:', e.message);
  }
}

// 拦截 console.log 来显示 Memory Hook 状态
const originalLog = console.log;
console.log = function(...args) {
  const msg = args.join(' ');
  
  // 检测 OpenClaw 开始处理消息
  if (msg.includes('User:') || msg.includes('message')) {
    initMemory().catch(() => {});
  }
  
  return originalLog.apply(this, args);
};

// 导出全局函数供 OpenClaw 调用
global.withDualMemory = async function(message, generateFn, context = {}) {
  await initMemory();
  
  if (!memoryHook) {
    return await generateFn(message);
  }
  
  return await memoryHook(
    typeof message === 'string' ? message : message.content,
    generateFn,
    {
      systemPrompt: context.systemPrompt,
      retrieveLimit: 5,
      shortTermRounds: 8,
      autoStore: true
    }
  );
};

console.log('🔌 [Memory Inject] 已加载，等待 OpenClaw 启动...');
