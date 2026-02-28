#!/usr/bin/env node
/**
 * NanoBot 记忆迁移脚本 v2
 * 优化版：避免重复初始化，批量处理
 */

const fs = require('fs');
const path = require('path');
const { MemoryStoreV3 } = require('./src/memory-store-v3.js');

// 迁移配置
const CONFIG = {
  workspaceRoot: '/root/.nanobot/workspace',
  memoryRoot: '/root/.nanobot/workspace/memory',
  
  // 需要迁移的目录
  migrateDirs: [
    'topics',      // 主题记忆
    'archive',     // 归档记录
    'issues',      // 问题记录
    'daily'        // 日常记录
  ],
  
  // 优先级映射
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

function extractTags(filePath, content) {
  const tags = [];
  const parts = filePath.replace(CONFIG.memoryRoot, '').split('/');
  parts.forEach(part => {
    if (part && !part.endsWith('.md') && part !== 'closed' && part !== 'open') {
      tags.push(part);
    }
  });
  const keywords = ['甜甜圈', '原神', '星穹铁道', 'Pixiv', 'OpenViking', 'MLX-Agent', 'NanoBot'];
  keywords.forEach(kw => {
    if (content.includes(kw)) tags.push(kw.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  });
  return [...new Set(tags)];
}

function extractTitle(content, filePath) {
  const firstLine = content.split('\n')[0];
  if (firstLine.startsWith('# ')) return firstLine.replace('# ', '').trim();
  return path.basename(filePath, '.md');
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
  console.log('🦇 NanoBot 记忆迁移 v2 开始\n');
  
  // 只初始化一次
  const store = new MemoryStoreV3();
  await store.initialize();
  
  let totalMigrated = 0;
  let totalSkipped = 0;
  const errors = [];
  
  for (const dir of CONFIG.migrateDirs) {
    const dirPath = path.join(CONFIG.memoryRoot, dir);
    if (!fs.existsSync(dirPath)) {
      console.log(`⚠️  目录不存在: ${dir}`);
      continue;
    }
    
    console.log(`\n📁 处理目录: ${dir}/`);
    const files = findMarkdownFiles(dirPath);
    
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.trim().length < 50) {
          totalSkipped++;
          continue;
        }
        
        const title = extractTitle(content, filePath);
        const priority = getPriority(filePath);
        const tags = extractTags(filePath, content);
        const source = filePath.replace(CONFIG.workspaceRoot + '/', '');
        
        // 使用 smartStore
        const result = await store.smartStore(content, {
          priority,
          tags,
          source,
          title,
          type: 'migrated'
        });
        
        if (result.stored) {
          totalMigrated++;
          console.log(`  ✅ ${path.basename(filePath)} [${priority}]`);
        } else {
          totalSkipped++;
          console.log(`  ⏭️  ${path.basename(filePath)}: ${result.reason}`);
        }
        
      } catch (error) {
        errors.push({ file: filePath, error: error.message });
        console.log(`  ❌ ${path.basename(filePath)}: ${error.message}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 迁移完成');
  console.log(`✅ 成功迁移: ${totalMigrated} 条`);
  console.log(`⏭️  跳过: ${totalSkipped} 条`);
  console.log(`❌ 失败: ${errors.length} 条`);
  
  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.slice(0, 10).forEach(e => console.log(`  - ${e.file}: ${e.error}`));
    if (errors.length > 10) console.log(`  ... 还有 ${errors.length - 10} 个错误`);
  }
  
  // 显示向量库状态
  console.log('\n📦 向量库状态:');
  const status = await store.getStatus ? await store.getStatus() : 'N/A';
  console.log(status);
}

migrate().catch(console.error);
