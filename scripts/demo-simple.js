#!/usr/bin/env node
/**
 * Memory Hook 简化版演示
 * 展示如何一行代码集成
 */

const { withMemory, getStats } = require('../src/memory-hook-simple');

async function demo() {
  console.log('🎭 Memory Hook (简化版) 演示\n');
  console.log('=' .repeat(60));
  
  // 模拟对话场景
  console.log('\n📝 模拟对话场景：\n');
  
  // 场景 1：询问 OpenClaw 更新
  const response1 = await withMemory(
    "OpenClaw 怎么更新？",
    async (messages) => {
      // 这里调用实际的 LLM 生成
      // 演示中直接返回模拟回复
      console.log('  📤 调用生成函数，传入的消息结构：');
      console.log(`     共 ${messages.length} 条消息`);
      console.log(`     1. ${messages[0].role}: ${messages[0].content.slice(0, 50)}...`);
      if (messages.length > 1) {
        console.log(`     2. ${messages[1].role}: 用户问题`);
      }
      return "汝可以通过 openclaw-updater skill 更新，运行 bash skills/openclaw-updater/scripts/update.sh";
    },
    {
      systemPrompt: "汝是忍野忍，一个傲娇的吸血鬼。",
      autoStore: true
    }
  );
  
  console.log(`\n  📥 生成回复: ${response1}\n`);
  
  // 场景 2：讨论黄金投资
  console.log('-'.repeat(60));
  const response2 = await withMemory(
    "我想买 1 万黄金基金",
    async (messages) => {
      console.log('  📤 传入的消息结构：');
      messages.forEach((m, i) => {
        const preview = m.content.slice(0, 60).replace(/\n/g, ' ');
        console.log(`     ${i + 1}. ${m.role}: ${preview}...`);
      });
      return "金价现在在高位 ($5,234)，风险较大。建议等回调到 $5,100 再买入。";
    }
  );
  
  console.log(`\n  📥 生成回复: ${response2}\n`);
  
  // 场景 3：测试记忆关联
  console.log('-'.repeat(60));
  console.log('\n  💡 第 3 轮对话，测试是否会检索到之前的"黄金"相关内容：\n');
  
  const response3 = await withMemory(
    "我上次说的投资怎么样了？",
    async (messages) => {
      // 检查是否包含检索到的记忆
      const hasMemory = messages.some(m => 
        m.role === 'system' && m.content.includes('黄金')
      );
      
      console.log('  📤 传入的消息结构：');
      messages.forEach((m, i) => {
        const type = m.role === 'system' && m.content.includes('历史') ? '(长期记忆)' :
                    m.role === 'system' && m.content.includes('对话') ? '(短期上下文)' :
                    m.role === 'system' ? '(系统)' : '(用户)';
        const preview = m.content.slice(0, 50).replace(/\n/g, ' ');
        console.log(`     ${i + 1}. ${m.role}${type}: ${preview}...`);
      });
      
      console.log(`\n  🔍 记忆检索状态: ${hasMemory ? '✅ 已关联黄金基金记忆' : '⚠️ 未检索到'}`);
      
      return hasMemory 
        ? "汝上次说的黄金基金，目前金价还在高位 ($5,234)，建议继续观望。"
        : "投资？汝说什么投资？";
    }
  );
  
  console.log(`\n  📥 生成回复: ${response3}\n`);
  
  // 显示统计
  console.log('='.repeat(60));
  console.log('\n📊 会话统计：');
  const stats = getStats();
  console.log(`- 当前会话轮数: ${stats.sessionRounds}`);
  console.log(`- 记忆系统状态: ${stats.memoryInitialized ? '✅ 已连接' : '❌ 未连接'}`);
  
  console.log('\n✅ 演示完成！');
  console.log('\n💡 实际使用方法：');
  console.log('  const { withMemory } = require("./memory-hook-simple");');
  console.log('  ');
  console.log('  const response = await withMemory(userMessage, async (messages) => {');
  console.log('    return await openclaw.generate(messages);');
  console.log('  });');
}

demo().catch(console.error);
