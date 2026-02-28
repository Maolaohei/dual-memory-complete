#!/usr/bin/env node
/**
 * NanoBot 记忆迁移脚本
 * 将 memory/ 目录下的 MD 文件导入到 LanceDB 向量库
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
  
  // 保留本地的核心文件（不迁移）
  keepLocal: [
    'MEMORY.md',
    'HISTORY.md',
    'COMPATIBILITY.md',
    'AUTO_ARCHIVE.md'
  ],
  
  // 优先级映射
  priorityMap: {
    'topics/preferences': 'P0',     // 用户偏好 - 最高优先级
    'topics/people': 'P0',          // 人物档案
    'topics/projects': 'P1',        // 项目记录
    'topics/system': 'P1',          // 系统配置
    'topics/ai-models': 'P1',       // AI 模型信息
    'issues/open': 'P1',            // 开放问题
    'issues/closed': 'P2',          // 已关闭问题
    'archive': 'P2',                // 归档记录
    'daily': 'P2'                   // 日常记录
  }
};

// 获取文件的优先级
function getPriority(filePath) {
  for (const [pattern, priority] of Object.entries(CONFIG.priorityMap)) {
    if (filePath.includes(pattern)) {
      return priority;
    }
  }
  return 'P2'; // 默认优先级
}

// 提取标签
function extractTags(filePath, content) {
  const tags = [];
  
  // 从路径提取
  const parts = filePath.replace(CONFIG.memoryRoot, '').split('/');
  parts.forEach(part => {
    if (part && !part.endsWith('.md') && part !== 'closed' && part !== 'open') {
      tags.push(part);
    }
  });
  
  // 从内容提取关键词
  const keywords = ['甜甜圈', '原神', '星穹铁道', 'Pixiv', 'OpenViking', 'MLX-Agent', 'NanoBot'];
  keywords.forEach(kw => {
    if (content.includes(kw)) {
      tags.push(kw.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    }
  });
  
  return [...new Set(tags)];
}

// 提取标题
function extractTitle(content, filePath) {
  const firstLine = content.split('\n')[0];
  if (firstLine.startsWith('# ')) {
    return firstLine.replace('# ', '').trim();
  }
  return path.basename(filePath, '.md');
}

// 主迁移函数
async function migrate() {
  console.log('🦇 NanoBot 记忆迁移开始\n');
  
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
        
        // 跳过空文件
        if (content.trim().length < 50) {
          totalSkipped++;
          continue;
        }
        
        const title = extractTitle(content, filePath);
        const priority = getPriority(filePath);
        const tags = extractTags(filePath, content);
        
        // 相对路径作为 source
        const source = filePath.replace(CONFIG.workspaceRoot + '/', '');
        
        // 存储到向量库
        await store.smartStore(content, {
          priority,
          tags,
          source,
          title,
          type: 'migrated'
        });
        
        totalMigrated++;
        console.log(`  ✅ ${path.basename(filePath)} [${priority}]`);
        
      } catch (error) {
        errors.push({ file: filePath, error: error.message });
        console.log(`  ❌ ${path.basename(filePath)}: ${error.message}`);
      }
    }
  }
  
  // 输出统计
  console.log('\n' + '='.repeat(50));
  console.log('📊 迁移完成');
  console.log(`✅ 成功迁移: ${totalMigrated} 条`);
  console.log(`⏭️  跳过: ${totalSkipped} 条`);
  console.log(`❌ 失败: ${errors.length} 条`);
  
  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }
  
  // 显示向量库状态
  console.log('\n📦 向量库状态:');
  await store.status();
}

// 递归查找 MD 文件
function findMarkdownFiles(dir) {
  const results = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return results;
}

// 执行迁移
migrate().catch(console.error);
