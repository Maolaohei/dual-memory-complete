#!/usr/bin/env node
/**
 * 智能压缩 - 跨会话记忆压缩
 * 将相似记忆总结为一条洞察
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memories.json');

// 简单的相似度计算（基于关键词重叠）
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// 加载记忆
function loadMemories() {
  if (fs.existsSync(MEMORY_FILE)) {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  }
  return [];
}

// 保存记忆
function saveMemories(memories) {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

// 查找相似记忆组
function findSimilarGroups(memories, threshold = 0.6) {
  const groups = [];
  const used = new Set();
  
  for (let i = 0; i < memories.length; i++) {
    if (used.has(i)) continue;
    
    const group = [memories[i]];
    used.add(i);
    
    for (let j = i + 1; j < memories.length; j++) {
      if (used.has(j)) continue;
      
      const similarity = calculateSimilarity(memories[i].content, memories[j].content);
      if (similarity >= threshold) {
        group.push(memories[j]);
        used.add(j);
      }
    }
    
    if (group.length > 1) {
      groups.push(group);
    }
  }
  
  return groups;
}

// AI总结（简化版，实际应调用LLM）
function summarizeMemories(memories) {
  // 提取共同主题
  const allWords = memories.flatMap(m => m.content.toLowerCase().split(/\s+/));
  const wordFreq = {};
  allWords.forEach(w => {
    if (w.length > 3) { // 忽略短词
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });
  
  // 找出高频词
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
  
  // 生成总结
  const latest = memories.reduce((latest, m) => 
    new Date(m.updatedAt) > new Date(latest.updatedAt) ? m : latest
  );
  
  const summary = {
    content: `[压缩总结] ${memories.length}条相关记忆：${latest.content.substring(0, 80)}... (主题: ${topWords.join(', ')})`,
    originalCount: memories.length,
    theme: topWords,
    latestContent: latest.content,
    priority: memories.some(m => m.priority === 'P0') ? 'P0' : 
              memories.some(m => m.priority === 'P1') ? 'P1' : 'P2',
    tags: [...new Set(memories.flatMap(m => m.tags))],
    compressedFrom: memories.map(m => m.id),
    createdAt: new Date().toISOString(),
    type: 'compressed'
  };
  
  return summary;
}

// 主压缩函数
async function compress(options = {}) {
  const { dryRun = false, threshold = 0.6, minGroupSize = 2 } = options;
  
  console.log('🗜️  开始智能压缩...');
  console.log(`   相似度阈值: ${threshold}`);
  console.log(`   最小组大小: ${minGroupSize}`);
  console.log(`   模式: ${dryRun ? '预览' : '执行'}\n`);
  
  const memories = loadMemories();
  console.log(`📊 当前记忆总数: ${memories.length}`);
  
  // 找出相似组
  const groups = findSimilarGroups(memories, threshold);
  const validGroups = groups.filter(g => g.length >= minGroupSize);
  
  console.log(`🔍 发现 ${validGroups.length} 个相似组`);
  
  if (validGroups.length === 0) {
    console.log('✅ 没有需要压缩的记忆');
    return;
  }
  
  // 显示预览
  console.log('\n📋 压缩预览:\n');
  validGroups.forEach((group, i) => {
    console.log(`组 ${i + 1} (${group.length} 条记忆):`);
    group.forEach(m => {
      console.log(`  - [${m.priority}] ${m.content.substring(0, 40)}...`);
    });
    
    const summary = summarizeMemories(group);
    console.log(`  → 压缩为: ${summary.content.substring(0, 60)}...`);
    console.log(`  → 主题: ${summary.theme.join(', ')}`);
    console.log('');
  });
  
  const totalToCompress = validGroups.reduce((sum, g) => sum + g.length, 0);
  console.log(`\n📈 统计:`);
  console.log(`   待压缩记忆: ${totalToCompress} 条`);
  console.log(`   压缩后预计: ${validGroups.length} 条`);
  console.log(`   节省空间: ${((1 - validGroups.length/totalToCompress) * 100).toFixed(1)}%`);
  
  if (dryRun) {
    console.log('\n💡 这是预览模式，使用 --execute 执行压缩');
    return;
  }
  
  // 执行压缩
  console.log('\n🔄 执行压缩...');
  
  const compressedMemories = [];
  const compressedIds = new Set();
  
  validGroups.forEach(group => {
    const summary = summarizeMemories(group);
    summary.id = 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    compressedMemories.push(summary);
    group.forEach(m => compressedIds.add(m.id));
  });
  
  // 保留未被压缩的记忆
  const remainingMemories = memories.filter(m => !compressedIds.has(m.id));
  
  // 合并
  const newMemories = [...remainingMemories, ...compressedMemories];
  
  saveMemories(newMemories);
  
  console.log('✅ 压缩完成!');
  console.log(`   原记忆数: ${memories.length}`);
  console.log(`   新记忆数: ${newMemories.length}`);
  console.log(`   减少了: ${memories.length - newMemories.length} 条`);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute');
  const threshold = args.includes('--threshold') ? parseFloat(args[args.indexOf('--threshold') + 1]) : 0.6;
  
  if (!dryRun && !execute) {
    console.log(`
🗜️  智能记忆压缩

Usage:
  node compress.js --dry-run          预览压缩效果
  node compress.js --execute          执行压缩
  node compress.js --threshold 0.7    设置相似度阈值 (默认0.6)

说明:
  将相似度高的记忆自动总结为一条洞察
  保留关键信息，减少存储冗余
`);
    return;
  }
  
  await compress({ dryRun, threshold });
}

main().catch(console.error);