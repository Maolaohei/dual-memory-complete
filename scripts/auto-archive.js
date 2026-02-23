#!/usr/bin/env node
/**
 * 自动归档系统 - Node.js 版本
 * 将长期未访问的主题文件归档到 archive/
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  memoryDir: '/root/.openclaw/workspace/memory',
  topicsDir: '/root/.openclaw/workspace/memory/topics',
  archiveDir: '/root/.openclaw/workspace/memory/archive',
  accessLog: '/root/.openclaw/workspace/memory/.access_log.jsonl',
  lastAccessDays: 30,      // 30天未访问则归档
  minFileAgeDays: 7,       // 文件至少7天龄
  excludePatterns: ['README.md', '*/index.*'],
  preserveHotTopics: 5     // 保留5个活跃主题
};

// 颜色输出
const c = {
  g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', reset: '\x1b[0m'
};

function print(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

async function loadAccessLog() {
  const accessData = {};
  try {
    const content = await fs.readFile(CONFIG.accessLog, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const filePath = record.file;
        const accessTime = record.timestamp;
        if (filePath && accessTime) {
          if (!accessData[filePath]) accessData[filePath] = [];
          accessData[filePath].push(accessTime);
        }
      } catch (e) {}
    }
  } catch (e) {
    print('y', '⚠️ 访问日志不存在或为空');
  }
  return accessData;
}

async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      mtime: stats.mtime.getTime() / 1000,
      size: stats.size
    };
  } catch (e) {
    return null;
  }
}

function shouldExclude(filePath) {
  const basename = path.basename(filePath);
  for (const pattern of CONFIG.excludePatterns) {
    if (basename === pattern || filePath.match(pattern.replace('*', '.*'))) {
      return true;
    }
  }
  return false;
}

async function scanTopics() {
  const files = [];
  
  async function scanDir(dir, baseDir = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(baseDir, entry.name);
      
      if (entry.isDirectory()) {
        await scanDir(fullPath, relativePath);
      } else if (entry.name.endsWith('.md')) {
        files.push({
          path: fullPath,
          relativePath: relativePath,
          topicPath: path.join('topics', relativePath)
        });
      }
    }
  }
  
  await scanDir(CONFIG.topicsDir);
  return files;
}

async function getHotTopics(accessData) {
  const topicAccess = {};
  for (const [file, times] of Object.entries(accessData)) {
    const lastAccess = Math.max(...times);
    topicAccess[file] = lastAccess;
  }
  
  return Object.entries(topicAccess)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONFIG.preserveHotTopics)
    .map(([file]) => file);
}

async function archiveFile(fileInfo, archiveMonth) {
  const archiveMonthDir = path.join(CONFIG.archiveDir, archiveMonth);
  await fs.mkdir(archiveMonthDir, { recursive: true });
  
  const destPath = path.join(archiveMonthDir, fileInfo.relativePath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  
  await fs.rename(fileInfo.path, destPath);
  return destPath;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportMode = args.includes('--report');
  
  print('c', '📦 自动归档系统启动...');
  print('c', dryRun ? '【试运行模式】' : '【实际执行模式】');
  
  // 确保目录存在
  await fs.mkdir(CONFIG.archiveDir, { recursive: true });
  
  // 加载访问日志
  const accessData = await loadAccessLog();
  const hotTopics = await getHotTopics(accessData);
  
  print('c', `🔥 活跃主题 (${hotTopics.length}个):`);
  hotTopics.forEach(f => print('g', `  - ${f}`));
  
  // 扫描所有主题文件
  const allFiles = await scanTopics();
  print('c', `📁 扫描到 ${allFiles.length} 个文件`);
  
  const now = Date.now() / 1000;
  const candidates = [];
  const skipped = [];
  
  for (const file of allFiles) {
    // 检查排除模式
    if (shouldExclude(file.relativePath)) {
      skipped.push({ file: file.relativePath, reason: '排除模式' });
      continue;
    }
    
    // 检查是否是热主题
    if (hotTopics.includes(file.topicPath)) {
      skipped.push({ file: file.relativePath, reason: '活跃主题' });
      continue;
    }
    
    // 获取文件状态
    const stats = await getFileStats(file.path);
    if (!stats) {
      skipped.push({ file: file.relativePath, reason: '无法读取' });
      continue;
    }
    
    const fileAge = (now - stats.mtime) / 86400;
    const lastAccess = accessData[file.topicPath] 
      ? Math.max(...accessData[file.topicPath])
      : stats.mtime;
    const daysSinceAccess = (now - lastAccess) / 86400;
    
    // 检查归档条件
    if (fileAge < CONFIG.minFileAgeDays) {
      skipped.push({ file: file.relativePath, reason: `文件太新 (${fileAge.toFixed(1)}天)` });
      continue;
    }
    
    if (daysSinceAccess < CONFIG.lastAccessDays) {
      skipped.push({ file: file.relativePath, reason: `近期访问过 (${daysSinceAccess.toFixed(1)}天前)` });
      continue;
    }
    
    candidates.push({
      ...file,
      fileAge,
      daysSinceAccess,
      lastAccess
    });
  }
  
  print('c', `\n📋 归档候选: ${candidates.length} 个文件`);
  
  if (candidates.length === 0) {
    print('g', '✅ 没有需要归档的文件');
    return;
  }
  
  // 按月份分组
  const byMonth = {};
  for (const file of candidates) {
    const date = new Date(file.lastAccess * 1000);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(file);
  }
  
  // 显示候选列表
  for (const [month, files] of Object.entries(byMonth)) {
    print('y', `\n📅 ${month} (${files.length}个):`);
    for (const f of files) {
      print('y', `  - ${f.relativePath} (最后访问: ${f.daysSinceAccess.toFixed(1)}天前)`);
    }
  }
  
  if (dryRun) {
    print('c', '\n🏃 试运行完成，未实际移动文件');
    print('c', '使用 --report 生成详细报告');
    return;
  }
  
  // 执行归档
  print('c', '\n🚀 开始归档...');
  const archived = [];
  
  for (const [month, files] of Object.entries(byMonth)) {
    for (const file of files) {
      try {
        const dest = await archiveFile(file, month);
        archived.push({
          original: file.relativePath,
          archived: dest,
          month: month
        });
        print('g', `✅ ${file.relativePath} → archive/${month}/`);
      } catch (e) {
        print('r', `❌ 归档失败: ${file.relativePath} - ${e.message}`);
      }
    }
  }
  
  // ========== 新增：调用 LanceDB 记忆自动降级 ==========
  print('c', '\n🧠 执行 LanceDB 记忆自动降级...');
  try {
    const { MemoryStoreV3 } = require('../src/memory-store-v3');
    const store = new MemoryStoreV3();
    await store.initialize();
    const demoted = await store.autoDemote();
    print('g', `✅ 记忆降级完成: ${demoted} 条`);
  } catch (e) {
    print('r', `⚠️ 记忆降级失败: ${e.message}`);
  }
  
  // 生成报告
  if (reportMode || archived.length > 0) {
    const reportDate = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(CONFIG.archiveDir, `archive-report-${reportDate}.md`);
    
    const report = `# 归档报告 - ${reportDate}

## 统计
- 扫描文件: ${allFiles.length}
- 归档候选: ${candidates.length}
- 实际归档: ${archived.length}
- 跳过: ${skipped.length}

## 归档文件
${archived.map(a => `- ${a.original} → archive/${a.month}/`).join('\n')}

## 跳过的文件
${skipped.map(s => `- ${s.file}: ${s.reason}`).join('\n')}
`;
    
    await fs.writeFile(reportPath, report, 'utf8');
    print('c', `\n📝 报告已保存: ${reportPath}`);
  }
  
  print('g', `\n✅ 归档完成！共归档 ${archived.length} 个文件`);
}

main().catch(e => {
  print('r', `❌ 错误: ${e.message}`);
  process.exit(1);
});
