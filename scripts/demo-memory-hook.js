#!/usr/bin/env node
/**
 * Memory Hook 演示脚本
 * 演示如何使用自动记忆中间件
 */

const { MemoryHook } = require('./src/memory-hook');

async function demo() {
  console.log('🎭 Memory Hook 演示\n');
  console.log('=' .repeat(50));
  
  // 初始化
  const hook = new MemoryHook({
    retrieveLimit: 3,
    maxShortTermRounds: 5,
    autoExtract: true
  });
  
  console.log('\n1️⃣ 模拟会话：技术讨论\n');
  
  // 第 1 轮
  const msg1 = "我想了解一下 OpenClaw 的更新方法";
  console.log(`用户: ${msg1}`);
  
  const context1 = await hook.beforeGenerate(msg1);
  console.log('\n📋 生成的上下文：');
  console.log(`- 检索到 ${context1._metadata.retrievedCount} 条记忆`);
  console.log(`- 近期对话: ${context1._metadata.compressedRounds} 轮`);
  console.log(`- 耗时: ${context1._metadata.latency}ms`);
  
  if (context1.longTerm) {
    console.log('\n📝 相关记忆：');
    console.log(context1.longTerm.slice(0, 300) + '...');
  }
  
  // 模拟回复
  const reply1 = "OpenClaw 可以通过 openclaw-updater skill 更新。汝想现在更新吗？";
  console.log(`\n助手: ${reply1}`);
  
  await hook.afterGenerate(msg1, reply1, { topic: 'openclaw' });
  
  // 第 2 轮
  console.log('\n' + '-'.repeat(50));
  const msg2 = "我打算买 1 万的黄金基金，你觉得怎么样？";
  console.log(`\n用户: ${msg2}`);
  
  const context2 = await hook.beforeGenerate(msg2);
  console.log('\n📋 生成的上下文：');
  console.log(`- 检索到 ${context2._metadata.retrievedCount} 条记忆`);
  console.log(`- 近期对话: ${context2._metadata.compressedRounds} 轮`);
  
  if (context2.shortTerm) {
    console.log('\n💬 短期上下文：');
    console.log(context2.shortTerm.slice(0, 300) + '...');
  }
  
  // 模拟回复
  const reply2 = "黄金基金目前处于高位，风险较大。建议汝先观望，等回调到 $5,100 再考虑。";
  console.log(`\n助手: ${reply2}`);
  
  await hook.afterGenerate(msg2, reply2, { topic: 'investment' });
  
  // 第 3 轮（测试记忆关联）
  console.log('\n' + '-'.repeat(50));
  const msg3 = "对了，我上次说的投资怎么样了？";
  console.log(`\n用户: ${msg3}`);
  
  const context3 = await hook.beforeGenerate(msg3);
  console.log('\n📋 生成的上下文：');
  console.log(`- 检索到 ${context3._metadata.retrievedCount} 条记忆`);
  
  if (context3.longTerm) {
    console.log('\n📝 检索到的记忆（应该包含黄金基金相关内容）：');
    console.log(context3.longTerm.slice(0, 400) + '...');
  }
  
  // 显示统计
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 会话统计：');
  const stats = hook.getStats();
  console.log(`- 当前会话轮数: ${stats.sessionRounds}`);
  console.log(`- 缓存大小: ${stats.cacheSize}`);
  
  console.log('\n✅ 演示完成！');
  console.log('\n💡 提示：检查向量库中是否自动存入了黄金基金相关内容：');
  console.log('   node cli.js search "黄金基金" -n 3');
}

demo().catch(console.error);
