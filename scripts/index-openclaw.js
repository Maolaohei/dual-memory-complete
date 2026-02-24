#!/usr/bin/env node
/**
 * OpenClaw 文档索引器
 * 将所有 OpenClaw 文档和配置索引到 dual-memory 向量库
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// 要索引的文件路径
const INDEX_PATHS = [
  // OpenClaw 官方文档
  '/usr/lib/node_modules/openclaw/docs/**/*.md',
  
  // 工作区核心配置
  '/root/.openclaw/workspace/*.md',
  '/root/.openclaw/workspace/SKILLS_INDEX.md',
  
  // Skills 文档
  '/root/.openclaw/workspace/skills/**/SKILL.md',
  '/root/.openclaw/workspace/skills/**/README.md',
  
  // 配置文件
  '/root/.openclaw/config/*.json'
];

// 排除的文件
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /downloads/,
  /cache/,
  /data\/vectordb/
];

async function findFiles(pattern) {
  try {
    // 使用 find 命令
    const cmd = `find ${pattern.replace(/\*\*/g, '*')} -type f 2>/dev/null | head -100`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    return result.trim().split('\n').filter(f => f);
  } catch (e) {
    return [];
  }
}

async function readFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      path: filePath,
      content: content.slice(0, 5000), // 限制长度
      size: content.length
    };
  } catch (e) {
    return null;
  }
}

async function indexToMemory(fileInfo) {
  const dualMemoryPath = path.join(__dirname, '../../dual-memory');
  
  // 构建标题和类型
  const fileName = path.basename(fileInfo.path);
  const dirName = path.dirname(fileInfo.path).split('/').pop();
  
  let type = 'documentation';
  let priority = 'P1';
  
  if (fileName === 'SKILL.md') {
    type = 'skill-doc';
    priority = 'P0'; // Skills 是核心
  } else if (fileName.includes('config')) {
    type = 'config';
    priority = 'P0';
  } else if (fileInfo.path.includes('SOUL.md') || fileInfo.path.includes('AGENTS.md')) {
    type = 'core-identity';
    priority = 'P0';
  }
  
  // 提取前200字作为摘要
  const summary = fileInfo.content.slice(0, 200).replace(/\n/g, ' ');
  
  // 构建存储内容
  const storeContent = `[${fileName}] ${summary}\n\n文件路径: ${fileInfo.path}\n\n完整内容:\n${fileInfo.content.slice(0, 3000)}`;
  
  try {
    execSync(
      `cd ${dualMemoryPath} && node cli.js add ${JSON.stringify(storeContent)} --type ${type} --priority ${priority}`,
      { timeout: 30000 }
    );
    return { success: true, path: fileInfo.path };
  } catch (e) {
    return { success: false, path: fileInfo.path, error: e.message };
  }
}

async function main() {
  console.log('🔍 扫描 OpenClaw 文档...\n');
  
  const allFiles = [];
  
  // 手动指定要索引的核心文件
  const coreFiles = [
    '/root/.openclaw/workspace/SOUL.md',
    '/root/.openclaw/workspace/AGENTS.md',
    '/root/.openclaw/workspace/RULES.md',
    '/root/.openclaw/workspace/TOOLS.md',
    '/root/.openclaw/workspace/SKILLS_INDEX.md',
    '/root/.openclaw/workspace/MEMORY.md',
    '/root/.openclaw/workspace/USER.md',
    '/root/.openclaw/workspace/HEARTBEAT.md',
  ];
  
  // 添加 skills 的 SKILL.md
  const skillFiles = execSync(
    'find /root/.openclaw/workspace/skills -name "SKILL.md" -type f 2>/dev/null',
    { encoding: 'utf-8' }
  ).trim().split('\n').filter(f => f);
  
  allFiles.push(...coreFiles, ...skillFiles);
  
  console.log(`📁 找到 ${allFiles.length} 个文件待索引\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    console.log(`[${i + 1}/${allFiles.length}] 索引: ${file}`);
    
    const fileInfo = await readFile(file);
    if (!fileInfo) {
      console.log(`  ❌ 读取失败`);
      failCount++;
      continue;
    }
    
    const result = await indexToMemory(fileInfo);
    if (result.success) {
      console.log(`  ✅ 成功`);
      successCount++;
    } else {
      console.log(`  ❌ 失败: ${result.error}`);
      failCount++;
    }
    
    // 小延迟避免过载
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n📊 索引完成:`);
  console.log(`  ✅ 成功: ${successCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  📁 总计: ${allFiles.length}`);
}

main().catch(console.error);
