#!/usr/bin/env node
/**
 * NanoBot 记忆迁移脚本 v4
 * 分批处理版
 */

const fs = require('fs');
const path = require('path');
const { MemoryStore } = require('./src/memory-store.js');

const CONFIG = {
  workspaceRoot: '/root/.nanobot/workspace',
  memoryRoot: '/root/.nanobot/workspace/memory',
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
  const args = process.argv.slice(2);
  const targetDir = args[0] || 'topics';
  
  console.log(`🦇 NanoBot 记忆迁移 - ${targetDir}/\n`);
  
  const store = new MemoryStore();
  await store.initialize();
  
  const dirPath = path.join(CONFIG.memoryRoot, targetDir);
  if (!fs.existsSync(dirPath)) {
    console.log(`❌ 目录不存在: ${dirPath}`);
    return;
  }
  
  const files = findMarkdownFiles(dirPath);
  console.log(`📁 找到 ${files.length} 个文件\n`);
  
  let success = 0, skipped = 0;
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.trim().length < 50) {
        skipped++;
        continue;
      }
      
      const priority = getPriority(filePath);
      const title = path.basename(filePath, '.md');
      
      const id = await store.addMemory(content, {
        type: 'migrated',
        priority,
        topic: targetDir
      });
      
      success++;
      console.log(`✅ ${title} [${priority}]`);
      
    } catch (error) {
      console.log(`❌ ${path.basename(filePath)}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 完成: 成功 ${success}, 跳过 ${skipped}`);
  const count = await store.count();
  console.log(`📦 向量库总计: ${count} 条`);
}

migrate().catch(console.error);
