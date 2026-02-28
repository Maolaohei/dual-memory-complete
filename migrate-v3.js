#!/usr/bin/env node
/**
 * NanoBot 记忆迁移脚本 v3
 * 简化版：直接使用 MemoryStore 基类
 */

const fs = require('fs');
const path = require('path');
const { MemoryStore } = require('./src/memory-store.js');

const CONFIG = {
  workspaceRoot: '/root/.nanobot/workspace',
  memoryRoot: '/root/.nanobot/workspace/memory',
  migrateDirs: ['topics', 'archive', 'issues', 'daily'],
  priorityMap: {
    'topics/preferences': 'P0',
    'topics/people': 'P0',
    'topics/projects': 'P1',
    'topics/system': 'P1',
    'topics/ai-models': 'P1',
    'issues/open': 'P1',
    'issues/closed': 'P2',
    'archive': 'P2',
    'daily': 'P2'
  }
};

function getPriority(filePath) {
  for (const [pattern, priority] of Object.entries(CONFIG.priorityMap)) {
    if (filePath.includes(pattern)) return priority;
  }
  return 'P2';
}

function findMarkdownFiles(dir) {
  const results = [];
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith('.md')) results.push(fullPath);
    }
  }
  walk(dir);
  return results;
}

async function migrate() {
  console.log('🦇 NanoBot 记忆迁移 v3 开始\n');
  
  // 初始化一次
  const store = new MemoryStore();
  await store.initialize();
  
  let total = 0, success = 0, skipped = 0;
  
  for (const dir of CONFIG.migrateDirs) {
    const dirPath = path.join(CONFIG.memoryRoot, dir);
    if (!fs.existsSync(dirPath)) continue;
    
    console.log(`\n📁 处理目录: ${dir}/`);
    const files = findMarkdownFiles(dirPath);
    
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.trim().length < 50) {
          skipped++;
          continue;
        }
        
        const priority = getPriority(filePath);
        const title = path.basename(filePath, '.md');
        
        // 使用 addMemory
        const id = await store.addMemory(content, {
          type: 'migrated',
          priority,
          topic: dir
        });
        
        success++;
        console.log(`  ✅ ${title} [${priority}]`);
        
      } catch (error) {
        console.log(`  ❌ ${path.basename(filePath)}: ${error.message}`);
      }
      total++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 迁移完成: 成功 ${success}/${total}, 跳过 ${skipped}`);
  
  // 显示状态
  const count = await store.count();
  console.log(`📦 向量库总计: ${count} 条记忆`);
}

migrate().catch(console.error);
