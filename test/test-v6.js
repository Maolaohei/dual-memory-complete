/**
 * v6.0 系统测试脚本
 */

const path = require('path');

// 测试结果收集
const results = {
  passed: [],
  failed: [],
  errors: []
};

function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`✅ ${name}`);
  } catch (err) {
    results.failed.push(name);
    results.errors.push({ name, error: err.message });
    console.log(`❌ ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('🧪 开始 v6.0 系统测试\n');

// ========== 1. 模块加载测试 ==========
console.log('📦 模块加载测试\n');

test('MultiTableStore 加载', () => {
  const { MultiTableStore } = require('../src/multi-table-store');
  assert(MultiTableStore, 'MultiTableStore 未定义');
});

test('ContextCompactor 加载', () => {
  const { ContextCompactor } = require('../src/context-compactor');
  assert(ContextCompactor, 'ContextCompactor 未定义');
});

test('SkillInstaller 加载', () => {
  const { SkillInstaller } = require('../src/skill-installer');
  assert(SkillInstaller, 'SkillInstaller 未定义');
});

test('TaskTracker 加载', () => {
  const { TaskTracker } = require('../src/task-tracker');
  assert(TaskTracker, 'TaskTracker 未定义');
});

test('ExperienceInjector 加载', () => {
  const { ExperienceInjector } = require('../src/experience-injector');
  assert(ExperienceInjector, 'ExperienceInjector 未定义');
});

test('SkillContext 加载', () => {
  const { SkillContext } = require('../src/skill-context');
  assert(SkillContext, 'SkillContext 未定义');
});

test('SessionManager 加载', () => {
  const { SessionManager } = require('../src/session-manager');
  assert(SessionManager, 'SessionManager 未定义');
});

test('SafeParse 加载', () => {
  const { safeParseJson } = require('../src/safe-parse');
  assert(safeParseJson, 'safeParseJson 未定义');
});

test('TokenCounter 加载', () => {
  const { estimate } = require('../src/token-counter');
  assert(estimate, 'estimate 未定义');
});

test('ModelRouter 加载', () => {
  const { routeModel, MODELS } = require('../src/model-router');
  assert(routeModel, 'routeModel 未定义');
  assert(MODELS.HEAVY === 'glm-5', 'HEAVY 模型配置错误');
  assert(MODELS.LIGHT === 'glm-4-flash', 'LIGHT 模型配置错误');
});

test('TriggerPruner 加载', () => {
  const { TriggerPruner } = require('../src/trigger-pruner');
  assert(TriggerPruner, 'TriggerPruner 未定义');
});

test('BackupManager 加载', () => {
  const { BackupManager } = require('../src/backup');
  assert(BackupManager, 'BackupManager 未定义');
});

test('HistoryArchiver 加载', () => {
  const { HistoryArchiver } = require('../src/history-archiver');
  assert(HistoryArchiver, 'HistoryArchiver 未定义');
});

console.log('\n');

// ========== 2. 功能测试 ==========
console.log('⚙️ 功能测试\n');

test('SafeParse - 正常 JSON', () => {
  const { safeParseJson } = require('../src/safe-parse');
  const result = safeParseJson('{"name": "test"}', {});
  assert(result.name === 'test', '解析结果错误');
});

test('SafeParse - markdown 代码块', () => {
  const { safeParseJson } = require('../src/safe-parse');
  const raw = '```json\n{"name": "test"}\n```';
  const result = safeParseJson(raw, {});
  assert(result.name === 'test', '解析结果错误');
});

test('SafeParse - 带解释文字', () => {
  const { safeParseJson } = require('../src/safe-parse');
  const raw = '这是结果：\n{"name": "test"}\n以上是答案。';
  const result = safeParseJson(raw, {});
  assert(result.name === 'test', '解析结果错误');
});

test('SafeParse - 降级默认值', () => {
  const { safeParseJson } = require('../src/safe-parse');
  const result = safeParseJson('invalid json', { fallback: true });
  assert(result.fallback === true, '降级值未生效');
});

test('TokenCounter - 中文估算', () => {
  const { estimate } = require('../src/token-counter');
  const tokens = estimate('这是一段中文测试');
  assert(tokens > 0, 'Token 估算错误');
  assert(tokens < 20, '中文估算偏高');
});

test('TokenCounter - 英文估算', () => {
  const { estimate } = require('../src/token-counter');
  const tokens = estimate('This is an English test');
  assert(tokens > 0, 'Token 估算错误');
  assert(tokens < 10, '英文估算偏高');
});

test('ModelRouter - 轻量任务路由', () => {
  const { routeModel, MODELS } = require('../src/model-router');
  const model = routeModel('trigger_extract');
  assert(model === MODELS.LIGHT, '轻量任务应路由到 LIGHT 模型');
});

test('ModelRouter - 重量任务路由', () => {
  const { routeModel, MODELS } = require('../src/model-router');
  const model = routeModel('complex_reasoning');
  assert(model === MODELS.HEAVY, '重量任务应路由到 HEAVY 模型');
});

test('ExperienceInjector - 高置信度', () => {
  const { ExperienceInjector } = require('../src/experience-injector');
  const injector = new ExperienceInjector();
  const result = injector.inject('test_task', 0.9, { hint: 'test hint' });
  assert(result !== null, '高置信度应返回结果');
  assert(result.level === 'high', '应为高置信度级别');
});

test('ExperienceInjector - 低置信度', () => {
  const { ExperienceInjector } = require('../src/experience-injector');
  const injector = new ExperienceInjector();
  const result = injector.inject('test_task', 0.3, { hint: 'test hint' });
  assert(result === null, '低置信度应返回 null');
});

test('SkillContext - TTL 管理', () => {
  const { SkillContext } = require('../src/skill-context');
  const ctx = new SkillContext('test-session');
  ctx.load('test-skill', 2);
  assert(ctx.isActive('test-skill'), 'Skill 应该活跃');
  ctx.tick();
  ctx.tick();
  assert(!ctx.isActive('test-skill'), 'TTL 用完后应自动卸载');
});

test('TriggerPruner - 触发词打分', () => {
  const { TriggerPruner } = require('../src/trigger-pruner');
  const pruner = new TriggerPruner();
  const score = pruner._scoreTrigger('pixiv');
  assert(score > 0, '触发词应有分数');
});

console.log('\n');

// ========== 3. 向量库测试 ==========
console.log('🗄️ 向量库测试\n');

test('MultiTableStore - 初始化', async () => {
  const { MultiTableStore } = require('../src/multi-table-store');
  const store = new MultiTableStore({
    dataDir: path.join(__dirname, '../data/vectordb')
  });
  await store.initialize();
  assert(store.tables.memories, 'memories 表未创建');
  assert(store.tables.core_files, 'core_files 表未创建');
  assert(store.tables.skills, 'skills 表未创建');
});

// ========== 输出结果 ==========
console.log('\n');
console.log('═'.repeat(50));
console.log('📊 测试结果');
console.log('═'.repeat(50));
console.log(`✅ 通过: ${results.passed.length}`);
console.log(`❌ 失败: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ 失败详情:');
  results.errors.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
}

console.log('═'.repeat(50));

process.exit(results.failed.length > 0 ? 1 : 0);