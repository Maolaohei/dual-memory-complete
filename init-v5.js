/**
 * v5.0 初始化测试脚本
 * 测试所有新模块是否正常工作
 */

const path = require('path');
const fs = require('fs').promises;

async function testSession() {
  console.log('\n📋 测试 Session 模块...');
  try {
    const { MemorySession } = require('./src/session');
    const session = new MemorySession();
    
    // 测试初始化
    const coreContext = await session.init();
    console.log(`  ✅ Session 初始化成功`);
    console.log(`  ✅ SOUL_CORE 长度: ${coreContext.length} 字符`);
    
    // 测试状态
    const status = session.getStatus();
    console.log(`  ✅ 会话状态: ${JSON.stringify(status, null, 2)}`);
    
    return true;
  } catch (err) {
    console.error(`  ❌ Session 测试失败:`, err.message);
    return false;
  }
}

async function testFileWatcher() {
  console.log('\n📋 测试 FileWatcher 模块...');
  try {
    const { FileWatcher } = require('./src/file-watcher');
    const watcher = new FileWatcher(null);
    
    // 测试启动
    await watcher.start();
    console.log(`  ✅ FileWatcher 启动成功`);
    
    // 测试状态
    const status = watcher.getStatus();
    console.log(`  ✅ 监听状态: ${JSON.stringify(status, null, 2)}`);
    
    // 停止监听
    watcher.stop();
    console.log(`  ✅ FileWatcher 已停止`);
    
    return true;
  } catch (err) {
    console.error(`  ❌ FileWatcher 测试失败:`, err.message);
    return false;
  }
}

async function testTokenBudget() {
  console.log('\n📋 测试 TokenBudget 模块...');
  try {
    const { getBudget, estimateTokens, buildContext } = require('./src/token-budget');
    
    // 测试预算获取
    const budget = getBudget();
    console.log(`  ✅ Token 预算: ${JSON.stringify(budget, null, 2)}`);
    
    // 测试 token 估算
    const testText = '吾乃吸血鬼，怪异之王。';
    const tokens = estimateTokens(testText);
    console.log(`  ✅ Token 估算: "${testText}" → ${tokens} tokens`);
    
    // 测试上下文构建
    const context = buildContext({
      soul: '这是 SOUL_CORE 的内容',
      memories: [{ content: '记忆1' }, { content: '记忆2' }],
      experience: { hint: '经验提示' },
      history: '对话历史'
    });
    console.log(`  ✅ 上下文构建: ${context.totalTokens} tokens (${context.utilization})`);
    
    return true;
  } catch (err) {
    console.error(`  ❌ TokenBudget 测试失败:`, err.message);
    return false;
  }
}

async function testExperiences() {
  console.log('\n📋 测试 Experiences 模块...');
  try {
    // 测试指纹提取
    const { extractFingerprint, fingerprintSimilarity } = require('./src/experiences/fingerprint');
    const fp1 = extractFingerprint('搜索 Pixiv 上的小忍美图');
    console.log(`  ✅ 指纹提取: ${JSON.stringify(fp1, null, 2)}`);
    
    const fp2 = extractFingerprint('下载 B站 的视频');
    const similarity = fingerprintSimilarity(fp1, fp2);
    console.log(`  ✅ 指纹相似度: ${similarity.toFixed(2)}`);
    
    // 测试分级注入
    const { buildHint, effectiveConfidence } = require('./src/experiences/injector');
    const testExp = {
      optimal_steps: [
        { description: '使用 pixiv-pro 搜索', success_rate: 0.95 }
      ],
      dead_ends: [
        { description: '使用 web_search', reason: '结果质量差' }
      ]
    };
    const hint = buildHint(testExp, 0.9);
    console.log(`  ✅ 经验提示: ${hint}`);
    
    // 测试执行追踪
    const { TaskTracker } = require('./src/experiences/tracker');
    const tracker = new TaskTracker(fp1);
    tracker.recordSuccess('使用 pixiv-pro 搜索', 'pixiv-pro', 200);
    tracker.recordSuccess('返回高质量结果', 'return', 50);
    const summary = tracker.getSummary();
    console.log(`  ✅ 追踪摘要: ${JSON.stringify(summary, null, 2)}`);
    
    return true;
  } catch (err) {
    console.error(`  ❌ Experiences 测试失败:`, err.message);
    return false;
  }
}

async function testFiles() {
  console.log('\n📋 测试文件结构...');
  const files = [
    '../memory/SOUL_CORE.md',
    '../memory/optimizations.json',
    'data/file_index.json',
    '../experiences/index.json',
    '../experiences/stats/report.json'
  ];
  
  let allExist = true;
  for (const file of files) {
    const fullPath = path.resolve(__dirname, file);
    try {
      await fs.access(fullPath);
      const stat = await fs.stat(fullPath);
      console.log(`  ✅ ${file} (${stat.size} bytes)`);
    } catch (err) {
      console.log(`  ❌ ${file} 不存在`);
      allExist = false;
    }
  }
  
  return allExist;
}

async function main() {
  console.log('🚀 v5.0 初始化测试开始...\n');
  console.log('=' .repeat(50));
  
  const results = {
    files: await testFiles(),
    session: await testSession(),
    fileWatcher: await testFileWatcher(),
    tokenBudget: await testTokenBudget(),
    experiences: await testExperiences()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 测试结果汇总:');
  
  let allPassed = true;
  for (const [name, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`);
    if (!passed) allPassed = false;
  }
  
  if (allPassed) {
    console.log('\n🎉 所有测试通过！v5.0 初始化成功！');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查错误信息');
  }
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
