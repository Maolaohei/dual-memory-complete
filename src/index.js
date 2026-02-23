/**
 * Dual-Memory System - Node.js Module Entry
 * 双系统记忆架构 - 模块入口
 */

const { MemoryStore } = require('./memory-store');
const { EnhancedMemoryStore } = require('./enhanced-store');
const { MemoryBridge } = require('./memory-bridge');
const { AutoStore } = require('./auto-store');
const { SmartExtractor } = require('./smart-extractor');

// 加载配置
const CONFIG = require('../config/default.json');

module.exports = {
  // 核心类
  MemoryStore,
  EnhancedMemoryStore,
  MemoryBridge,
  AutoStore,
  SmartExtractor,
  
  // 配置
  CONFIG,
  
  // 便捷函数
  async createStore(options = {}) {
    const store = new EnhancedMemoryStore({
      dbPath: options.dbPath || CONFIG.paths.dbPath,
      tableName: options.tableName || CONFIG.paths.tableName,
      ...options
    });
    await store.initialize();
    return store;
  },
  
  async createBridge(options = {}) {
    const bridge = new MemoryBridge({
      dbPath: options.dbPath || CONFIG.paths.dbPath,
      tableName: options.tableName || CONFIG.paths.tableName,
      memoryMdPath: options.memoryMdPath || CONFIG.paths.memoryMdPath,
      memoryDir: options.memoryDir || CONFIG.paths.memoryDir,
      ...options
    });
    await bridge.initialize();
    return bridge;
  },
  
  // 版本信息
  version: CONFIG.version
};
