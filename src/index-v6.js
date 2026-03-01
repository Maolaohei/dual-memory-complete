/**
 * 小忍记忆系统 v6.0 - 统一入口
 * 
 * 模块：
 * - MultiTableStore: 多表向量存储
 * - FileWatcher: 文件变更监听
 * - ContextCompactor: 上下文压缩
 * - SkillInstaller: Skill 安装注册
 * - TaskTracker: 任务执行追踪
 * - ExperienceInjector: 经验分级注入
 * - TokenBudget: Token 预算管理
 * - SkillContext: Skill 作用域管理（问题20、26）
 * - SessionManager: 多会话并发保护（问题23）
 * - SafeParse: LLM JSON 解析容错（问题21）
 * - TokenCounter: Token 计数（问题29）
 * - ModelRouter: 模型路由（问题28）
 * - TriggerPruner: 触发词修剪（问题25）
 * - BackupManager: 数据备份（问题27）
 * - HistoryArchiver: HISTORY.md 归档（问题30）
 */

const { MultiTableStore } = require('./multi-table-store');
const { FileWatcher } = require('./file-watcher');
const { ContextCompactor } = require('./context-compactor');
const { SkillInstaller } = require('./skill-installer');
const { TaskTracker } = require('./task-tracker');
const { ExperienceInjector } = require('./experience-injector');
const { SkillContext } = require('./skill-context');
const { SessionManager } = require('./session-manager');
const { safeParseJson, safeLLMJson } = require('./safe-parse');
const { estimate, estimateMessages, checkBudget, trimToBudget } = require('./token-counter');
const { routeModel, smartRoute, MODELS } = require('./model-router');
const { TriggerPruner } = require('./trigger-pruner');
const { BackupManager } = require('./backup');
const { HistoryArchiver } = require('./history-archiver');
const tokenBudget = require('./token-budget');

class MemorySystemV6 {
  constructor(options = {}) {
    this.options = options;
    
    // 核心组件
    this.store = null;
    this.fileWatcher = null;
    this.compactor = null;
    this.skillInstaller = null;
    this.taskTracker = null;
    this.experienceInjector = null;
    
    this._initialized = false;
  }

  /**
   * 初始化系统
   */
  async initialize() {
    if (this._initialized) return;

    console.log('🚀 小忍记忆系统 v6.0 初始化中...\n');

    // 1. 初始化多表存储
    this.store = new MultiTableStore(this.options.store);
    await this.store.initialize();

    // 2. 初始化文件监听
    this.fileWatcher = new FileWatcher(this.store, this.options.fileWatcher);

    // 3. 初始化上下文压缩
    this.compactor = new ContextCompactor(this.options.compactor);

    // 4. 初始化 Skill 安装器
    this.skillInstaller = new SkillInstaller(this.options.skillInstaller);

    // 5. 初始化任务追踪
    this.taskTracker = new TaskTracker(this.options.taskTracker);

    // 6. 初始化经验注入
    this.experienceInjector = new ExperienceInjector(this.options.experienceInjector);

    // 7. 加载 Token 预算配置
    await tokenBudget.loadBudgetConfig();

    this._initialized = true;
    console.log('\n✅ 小忍记忆系统 v6.0 初始化完成\n');

    return this;
  }

  /**
   * 启动文件监听
   */
  async startFileWatcher() {
    if (!this._initialized) await this.initialize();
    await this.fileWatcher.start();
  }

  /**
   * 停止文件监听
   */
  stopFileWatcher() {
    this.fileWatcher?.stop();
  }

  /**
   * 添加记忆
   */
  async addMemory(content, metadata = {}) {
    if (!this._initialized) await this.initialize();
    return this.store.addMemory(content, metadata);
  }

  /**
   * 搜索记忆
   */
  async searchMemories(query, nResults = 5) {
    if (!this._initialized) await this.initialize();
    return this.store.searchMemories(query, nResults);
  }

  /**
   * 搜索 Skill
   */
  async searchSkills(query, nResults = 3, threshold = 0.75) {
    if (!this._initialized) await this.initialize();
    return this.store.searchSkills(query, nResults, threshold);
  }

  /**
   * 搜索文件切片
   */
  async searchFileChunks(query, nResults = 5) {
    if (!this._initialized) await this.initialize();
    return this.store.searchFileChunks(query, nResults);
  }

  /**
   * 开始追踪任务
   */
  startTask(taskId, taskType, input) {
    return this.taskTracker.startTask(taskId, taskType, input);
  }

  /**
   * 记录任务步骤
   */
  recordStep(task, stepName, stepData) {
    return this.taskTracker.recordStep(task, stepName, stepData);
  }

  /**
   * 完成任务
   */
  async completeTask(task, result) {
    return this.taskTracker.completeTask(task, result);
  }

  /**
   * 任务失败
   */
  async failTask(task, error) {
    return this.taskTracker.failTask(task, error);
  }

  /**
   * 获取经验提示
   */
  async getExperienceHint(taskType) {
    return this.taskTracker.generateExperienceHint(taskType);
  }

  /**
   * 注入经验
   */
  injectExperience(taskType, confidence, experience) {
    return this.experienceInjector.inject(taskType, confidence, experience);
  }

  /**
   * 压缩上下文
   */
  async compactContext(messages) {
    return this.compactor.compact(messages);
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompactContext(currentTokens) {
    return this.compactor.shouldCompact(currentTokens);
  }

  /**
   * 构建 Token 预算上下文
   */
  buildContext(options) {
    return tokenBudget.buildContext(options);
  }

  /**
   * 获取系统状态
   */
  async getStatus() {
    const storeStats = this.store ? await this.store.getStats() : {};
    const fileWatcherStatus = this.fileWatcher?.getStatus() || {};
    const experienceStats = this.experienceInjector?.getStats() || {};

    return {
      version: '6.0.0',
      initialized: this._initialized,
      store: storeStats,
      fileWatcher: fileWatcherStatus,
      experiences: experienceStats,
      tokenBudget: tokenBudget.getBudget()
    };
  }

  /**
   * 安装 Skill
   */
  async installSkill(skillPath) {
    if (!this._initialized) await this.initialize();
    return this.skillInstaller.install(skillPath);
  }

  /**
   * 重新索引所有 Skill
   */
  async reindexSkills() {
    if (!this._initialized) await this.initialize();
    return this.skillInstaller.reindexAll();
  }
}

// 导出模块
module.exports = {
  // 核心系统
  MemorySystemV6,
  
  // 存储层
  MultiTableStore,
  
  // 监听层
  FileWatcher,
  
  // 压缩层
  ContextCompactor,
  
  // Skill 层
  SkillInstaller,
  SkillContext,
  TriggerPruner,
  
  // 任务层
  TaskTracker,
  ExperienceInjector,
  
  // 会话层
  SessionManager,
  
  // 工具层
  safeParseJson,
  safeLLMJson,
  estimate,
  estimateMessages,
  checkBudget,
  trimToBudget,
  routeModel,
  smartRoute,
  MODELS,
  
  // 维护层
  BackupManager,
  HistoryArchiver,
  
  // 预算
  tokenBudget
};