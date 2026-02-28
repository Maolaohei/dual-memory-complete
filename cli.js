/**
 * Dual-Memory 统一 CLI (v2 + v3 合并版)
 * 
 * 命令分类:
 * - 基础 (v2兼容): add, search, list, status, delete, update
 * - 智能 (v3增强): store, retrieve, auto, confirm, forget, timeline, value-test
 */

const { MemoryStoreV3 } = require('./src/memory-store-v3');
const { SmartExtractor } = require('./src/smart-extractor');

const c = {
  reset: '\x1b[0m', g: '\x1b[32m', r: '\x1b[31m',
  y: '\x1b[33m', b: '\x1b[34m', c: '\x1b[36m', m: '\x1b[35m'
};

function print(color, msg) { console.log(`${c[color]}${msg}${c.reset}`); }

let store = null;
async function getStore() {
  if (!store) {
    store = new MemoryStoreV3({
      dbPath: './data/vectordb',
      tableName: 'memories',
      timelinePath: './timeline.jsonl'
    });
    await store.initialize();
  }
  return store;
}

// ========== 基础命令 (v2 兼容) ==========

async function cmdAdd(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供记忆内容'); process.exit(1); }
  
  const content = args[0];
  const metadata = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--type' && args[i+1]) metadata.type = args[++i];
    else if (args[i] === '--topic' && args[i+1]) metadata.topic = args[++i];
    else if (args[i] === '--priority' && args[i+1]) metadata.priority = args[++i];
  }
  
  const s = await getStore();
  const result = await s.smartStore(content, metadata);
  
  if (result.stored) {
    print('g', `✅ 记忆已添加 (ID: ${result.id.slice(0, 25)}...)`);
    print('c', `   质量: ${result.quality?.toFixed(2)} | 优先级: ${result.priority}`);
  } else {
    print('y', `ℹ️ 未存储: ${result.reason}`);
  }
}

async function cmdSearch(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供搜索关键词'); process.exit(1); }
  
  const query = args[0];
  let limit = 5;
  const nIndex = args.indexOf('-n');
  if (nIndex !== -1 && args[nIndex + 1]) limit = parseInt(args[nIndex + 1], 10);
  
  const s = await getStore();
  const result = await s.smartRetrieve(query, { limit, decayAware: true });
  
  print('b', `\n🔍 搜索 "${query}" 找到 ${result.count} 条 (${result.latency}ms)`);
  
  if (result.results.length === 0) {
    print('y', '   未找到相关记忆');
    return;
  }
  
  result.results.forEach((r, i) => {
    const content = r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content;
    const effConf = r.effective_confidence?.toFixed(2) || 'N/A';
    const priority = r.metadata.priority || 'P2';
    const type = r.metadata.type || 'general';
    
    // 根据优先级选择颜色
    const color = priority === 'P0' ? 'g' : priority === 'P1' ? 'y' : 'c';
    print(color, `${i + 1}. ${content}`);
    console.log(`   置信度: ${effConf} | 优先级: ${priority} | 类型: ${type}`);
  });
}

async function cmdList(args) {
  const limit = args[0] ? parseInt(args[0], 10) : 10;
  const s = await getStore();
  
  // 使用空查询获取最近记忆
  const result = await s.smartRetrieve(' ', { limit, decayAware: false });
  
  print('b', `\n📋 最近 ${result.results.length} 条记忆:\n`);
  result.results.forEach((m, i) => {
    const content = m.content.length > 50 ? m.content.slice(0, 50) + '...' : m.content;
    const status = m.metadata.forgotten ? '🌫️ [已遗忘]' : '';
    console.log(`${i + 1}. [${m.id.slice(0, 16)}...] ${status}`);
    print('g', `   ${content}`);
    if (m.metadata.type) console.log(`   类型: ${m.metadata.type} | 优先级: ${m.metadata.priority}`);
    console.log();
  });
}

async function cmdStatus() {
  const s = await getStore();
  const stats = await s.getStats();
  
  const fs = require('fs');
  const lancedbExists = fs.existsSync('./data/vectordb');
  const timelineExists = fs.existsSync('./timeline.jsonl');
  
  print('b', '\n🧠 Dual-Memory 统一系统状态 (v2+v3)\n');
  print('g', `LanceDB 向量库:    ${lancedbExists ? '✅' : '❌'}`);
  print('g', `时间轴日志:        ${timelineExists ? '✅' : '❌'}`);
  print('y', `总记忆数量:        ${stats.total} 条`);
  
  if (Object.keys(stats.by_type).length > 0) {
    print('c', '\n按类型分布:');
    Object.entries(stats.by_type).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
  
  print('b', '\n✨ 系统特性:');
  print('g', '  • 实时写入 + 即时检索');
  print('g', '  • 时间轴版本化');
  print('g', '  • 动态置信衰减');
  print('g', '  • 冲突检测与解决');
  print('g', '  • 上下文锚定');
  print('g', '  • 遗忘机制');
  print('g', '  • 5秒检索缓存');
}

async function cmdDelete(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供记忆ID'); process.exit(1); }
  
  const s = await getStore();
  await s.deleteMemory(args[0]);
  print('g', `✅ 已删除记忆 ${args[0]}`);
}

// ========== 智能命令 (v3 增强) ==========

async function cmdStore(args) {
  if (args.length < 1) {
    print('r', '❌ 错误: 请提供记忆内容');
    console.log('用法: node cli.js store "内容" [--type xxx] [--topic xxx] [--priority P0/P1/P2]');
    process.exit(1);
  }
  
  const content = args[0];
  const metadata = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--type' && args[i+1]) metadata.type = args[++i];
    else if (args[i] === '--topic' && args[i+1]) metadata.topic = args[++i];
    else if (args[i] === '--priority' && args[i+1]) metadata.priority = args[++i];
    else if (args[i] === '--context' && args[i+1]) metadata.context = args[++i];
  }
  
  const s = await getStore();
  const result = await s.smartStore(content, metadata);
  
  if (result.stored) {
    print('g', `✅ 智能存储成功 (${result.latency}ms)`);
    print('c', `   ID: ${result.id}`);
    print('y', `   优先级: ${result.priority} | 置信度: ${result.confidence.toFixed(1)}/10`);
    if (result.quality) print('c', `   质量分: ${result.quality.toFixed(2)}`);
    if (result.conflicts) print('m', `   ⚠️ 自动解决 ${result.conflicts.length} 个冲突`);
    if (result.merged) print('b', `   🔄 已合并到相似记忆`);
  } else {
    print('y', `ℹ️ 未存储: ${result.reason} (分数: ${result.score?.toFixed(1)})`);
  }
}

async function cmdRetrieve(args) {
  if (args.length < 1) {
    print('r', '❌ 错误: 请提供查询内容');
    console.log('用法: node cli.js retrieve "查询" [-n 数量] [--history] [--no-decay] [--no-hyde]');
    process.exit(1);
  }
  
  const query = args[0];
  let limit = 5;
  let includeHistory = false;
  let decayAware = true;
  let useHyDE = true;
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-n' && args[i+1]) limit = parseInt(args[++i], 10);
    else if (args[i] === '--history') includeHistory = true;
    else if (args[i] === '--no-decay') decayAware = false;
    else if (args[i] === '--no-hyde') useHyDE = false;
  }
  
  const s = await getStore();
  const result = await s.smartRetrieve(query, { limit, includeHistory, decayAware, useHyDE });
  
  print('b', `\n🔍 智能检索 "${query}" (${result.latency}ms)`);
  if (result.hyde_used) print('m', `   HyDE: 已启用`);
  print('c', `找到 ${result.count} 条有效记忆:\n`);
  
  result.results.forEach((r, i) => {
    const content = r.content.length > 70 ? r.content.slice(0, 70) + '...' : r.content;
    const effConf = r.effective_confidence?.toFixed(2) || 'N/A';
    const origConf = r.original_confidence?.toFixed(1) || 'N/A';
    
    print('g', `${i + 1}. ${content}`);
    console.log(`   有效置信度: ${effConf} (原始: ${origConf}) | 优先级: ${r.metadata.priority || 'N/A'}`);
    if (r.metadata.topic) console.log(`   主题: ${r.metadata.topic}`);
    if (r.history && r.history.length > 1) {
      print('m', `   📜 历史版本: ${r.history.length} 个`);
    }
    console.log();
  });
}

async function cmdAuto(args) {
  if (args.length < 1) {
    print('r', '❌ 错误: 请提供文本');
    console.log('用法: node cli.js auto "长文本内容"');
    process.exit(1);
  }
  
  const text = args.join(' ');
  const s = await getStore();
  
  print('b', '\n🤖 智能批量提取中...\n');
  const result = await s.autoStore(text);
  
  print('g', `✅ 处理完成:`);
  print('c', `   提取到: ${result.extracted} 条`);
  print('g', `   已存储: ${result.stored} 条`);
  print('y', `   已跳过: ${result.skipped} 条`);
  
  if (result.details.length > 0) {
    console.log('\n详细信息:');
    result.details.forEach((d, i) => {
      const status = d.stored ? '✅' : '❌';
      const color = d.stored ? 'g' : 'y';
      print(color, `   ${status} ${d.reason || d.id?.slice(0, 20) || 'unknown'}`);
    });
  }
}

async function cmdConfirm(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供记忆ID'); process.exit(1); }
  
  const s = await getStore();
  const result = await s.confirm(args[0]);
  
  if (result.success) {
    print('g', `✅ 已确认记忆 ${args[0].slice(0, 20)}...`);
    print('c', `   新置信度: ${result.newConfidence.toFixed(1)}/10`);
  } else {
    print('r', `❌ 确认失败: ${result.error}`);
  }
}

async function cmdForget(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供记忆ID'); process.exit(1); }
  
  const id = args[0];
  const reason = args.slice(1).join(' ') || '用户主动遗忘';
  
  const s = await getStore();
  const result = await s.forget(id, reason);
  
  if (result.success) {
    print('m', `🌫️ 已遗忘记忆 ${id.slice(0, 20)}...`);
    print('y', `   原因: ${reason}`);
  } else {
    print('r', `❌ 遗忘失败: ${result.error}`);
  }
}

async function cmdTimeline(args) {
  const fs = require('fs').promises;
  const limit = args[0] ? parseInt(args[0], 10) : 20;
  
  try {
    const data = await fs.readFile('./timeline.jsonl', 'utf8');
    const lines = data.split('\n').filter(l => l.trim());
    const recent = lines.slice(-limit);
    
    print('b', `\n📜 时间轴历史 (最近 ${recent.length} 条):\n`);
    
    recent.forEach((line, i) => {
      try {
        const r = JSON.parse(line);
        const time = r.timestamp?.slice(0, 19).replace('T', ' ') || 'N/A';
        const action = r.action || 'store';
        const content = r.content?.slice(0, 35) + '...' || 'N/A';
        
        const color = action === 'forgotten' ? 'm' : action === 'confirmed' ? 'g' : 'c';
        const icon = action === 'forgotten' ? '🌫️' : action === 'confirmed' ? '👍' : '📝';
        
        print(color, `${i+1}. [${time}] ${icon} ${action.toUpperCase()}`);
        console.log(`   ${content}`);
      } catch {}
    });
  } catch (err) {
    print('r', '❌ 读取时间轴失败: ' + err.message);
  }
}

async function cmdValueTest(args) {
  if (args.length < 1) { print('r', '❌ 错误: 请提供文本'); process.exit(1); }
  
  const text = args.join(' ');
  const extractor = new SmartExtractor();
  
  print('b', '\n📊 记忆价值评估\n');
  print('c', `文本: "${text.slice(0, 60)}..."\n`);
  
  const score = extractor.calculateValue(text);
  let grade, color;
  if (score >= 7) { grade = 'P0 - 永久记忆'; color = 'g'; }
  else if (score >= 6.5) { grade = 'P1 - 长期记忆'; color = 'y'; }
  else if (score >= 5) { grade = 'P2 - 短期记忆'; color = 'c'; }
  else if (score >= 4) { grade = 'P3 - 边缘记忆'; color = 'm'; }
  else { grade = 'SKIP - 不记忆'; color = 'r'; }
  
  print(color, `价值分数: ${score.toFixed(1)}/10`);
  print(color, `存储等级: ${grade}`);
  
  const extracted = extractor.extract(text);
  if (extracted.length > 0) {
    print('b', '\n可提取内容:');
    extracted.forEach((e, i) => {
      print('g', `  ${i+1}. [${e.type}] ${e.content.slice(0, 40)}...`);
    });
  }
}

// ========== 主函数 ==========

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const cmdArgs = args.slice(1);
  
  const commands = {
    // 基础命令 (v2兼容)
    'add': cmdAdd,
    'search': cmdSearch,
    'list': cmdList,
    'status': cmdStatus,
    'delete': cmdDelete,
    
    // 智能命令 (v3增强)
    'store': cmdStore,
    'retrieve': cmdRetrieve,
    'auto': cmdAuto,
    'confirm': cmdConfirm,
    'forget': cmdForget,
    'timeline': cmdTimeline,
    'value-test': cmdValueTest
  };
  
  if (!command || !commands[command]) {
    console.log(`
🧠 Dual-Memory 统一 CLI (v2+v3 合并版)

基础命令 (v2兼容):
  add           添加记忆
                node cli.js add "内容" [--type xxx] [--priority P0]
  
  search        搜索记忆
                node cli.js search "关键词" [-n 5]
  
  list          列表记忆
                node cli.js list [数量]
  
  status        查看状态
                node cli.js status
  
  delete        删除记忆
                node cli.js delete <id>

智能命令 (v3增强):
  store         智能存储 (带上下文/冲突检测)
                node cli.js store "内容" [--type xxx] [--priority P0]
  
  retrieve      智能检索 (带动态衰减/缓存)
                node cli.js retrieve "查询" [-n 5] [--history]
  
  auto          智能批量提取
                node cli.js auto "长文本"
  
  confirm       用户确认提升权重
                node cli.js confirm <id>
  
  forget        遗忘记忆
                node cli.js forget <id> [原因]
  
  timeline      查看时间轴历史
                node cli.js timeline [数量]
  
  value-test    测试记忆价值评分
                node cli.js value-test "文本"

示例:
  node cli.js store "我最喜欢草莓甜甜圈" --type preference --priority P0
  node cli.js retrieve "甜甜圈" -n 3 --history
  node cli.js value-test "记住我的密码是123456"
`);
    process.exit(1);
  }
  
  try {
    await commands[command](cmdArgs);
    // 给 LanceDB 一些时间完成后台操作
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    print('r', `\n❌ 错误: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
