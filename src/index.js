/**
 * Dual-Memory System - Node.js Module Entry
 * 双系统记忆架构 - 模块入口
 * 
 * v6.0: 多表向量库 · 置信度可配置 · 触发词自进化
 */

const { MemoryStore } = require('./memory-store');
const { EnhancedMemoryStore } = require('./enhanced-store');
const { MemoryBridge } = require('./memory-bridge');
const { AutoStore } = require('./auto-store');
const { SmartExtractor } = require('./smart-extractor');

// v6.0 新模块
const v6 = require('./index-v6');

// 加载配置
const CONFIG = require('../config/default.json');

module.exports = {
  // 核心类 (v5.x)
  MemoryStore,
  EnhancedMemoryStore,
  MemoryBridge,
  AutoStore,
  SmartExtractor,
  
  // v6.0 新模块
  ...v6,
  
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
  
  // v6.0 便捷函数
  async createV6System(options = {}) {
    const system = new v6.MemorySystemV6(options);
    await system.initialize();
    return system;
  },
  
  // 版本信息
  version: '6.0.0'
};
