/**
 * v4.0 功能评估测试
 */

const { MemoryStoreV3 } = require('./src/memory-store-v3');
const { RetrievalFeedback } = require('./src/retrieval-feedback');
const { estimateTokens, getBudgetReport } = require('./src/token-budget');

async function evaluate() {
  console.log('🧪 v4.0 功能评估测试\n');
  console.log('='.repeat(50));
  
  // 1. 初始化
  const store = new MemoryStoreV3();
  await store.initialize();
  
  // 2. 测试检索性能
  console.log('\n📊 检索性能测试:');
  const queries = ['甜甜圈', '用户偏好', 'Pixiv', '项目配置', '角色定义'];
  const latencies = [];
  
  for (const query of queries) {
    const start = Date.now();
    const result = await store.smartRetrieve(query, { limit: 3, useHyDE: true });
    const latency = Date.now() - start;
    latencies.push(latency);
    console.log(`   "${query}": ${result.count}条, ${latency}ms, HyDE=${result.hyde_used}`);
  }
  
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(`   平均延迟: ${avgLatency.toFixed(0)}ms`);
  
  // 3. 测试时间衰减评分
  console.log('\n📈 时间衰减评分测试:');
  const testResult = await store.smartRetrieve('甜甜圈', { limit: 1 });
  if (testResult.results.length > 0) {
    const r = testResult.results[0];
    console.log(`   内容: ${r.content.slice(0, 30)}...`);
    console.log(`   原始置信度: ${r.original_confidence}`);
    console.log(`   有效置信度: ${r.effective_confidence.toFixed(2)}`);
    console.log(`   优先级: ${r.metadata.priority}`);
  }
  
  // 4. Token 预算测试
  console.log('\n💰 Token 预算测试:');
  const testText = '这是一个测试文本，用于估算 token 数量。This is a test text for token estimation.';
  const tokens = estimateTokens(testText);
  console.log(`   文本: "${testText.slice(0, 30)}..."`);
  console.log(`   估算 tokens: ${tokens}`);
  
  const report = getBudgetReport({ core_files: 750, retrieved_memory: 400 });
  console.log(`   预算使用报告:`);
  for (const [key, data] of Object.entries(report.usage)) {
    console.log(`     ${key}: ${data.used}/${data.limit} (${data.percentage}) ${data.status}`);
  }
  
  // 5. 检索反馈测试
  console.log('\n🔄 检索反馈测试:');
  const feedback = new RetrievalFeedback();
  await feedback.loadStats();
  console.log(`   总查询数: ${feedback.stats.totalQueries}`);
  console.log(`   总命中数: ${feedback.stats.totalHits}`);
  console.log(`   平均延迟: ${feedback.stats.avgLatency.toFixed(0)}ms`);
  
  // 6. 统计信息
  console.log('\n📊 系统统计:');
  const allMemories = await store.listMemories(10000);
  const byType = {};
  const byPriority = {};
  
  for (const m of allMemories) {
    const type = m.metadata?.type || 'unknown';
    const priority = m.metadata?.priority || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    byPriority[priority] = (byPriority[priority] || 0) + 1;
  }
  
  console.log(`   总记忆数: ${allMemories.length}`);
  console.log(`   按类型: ${JSON.stringify(byType)}`);
  console.log(`   按优先级: ${JSON.stringify(byPriority)}`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 评估测试完成！');
  
  return {
    avgLatency,
    totalMemories: allMemories.length,
    byType,
    byPriority
  };
}

evaluate().catch(console.error);
