#!/usr/bin/env node
/**
 * Dual-Memory v4.0 CLI
 * 主动记忆干预系统
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'memory');

// 加载现有记忆
function loadMemories() {
  const file = path.join(MEMORY_DIR, 'memories.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return [];
}

// 保存记忆
function saveMemories(memories) {
  const file = path.join(MEMORY_DIR, 'memories.json');
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(memories, null, 2));
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 1. forget - 删除记忆
async function forget(memoryId) {
  const memories = loadMemories();
  const index = memories.findIndex(m => m.id === memoryId);
  
  if (index === -1) {
    console.log(`❌ 记忆未找到: ${memoryId}`);
    return false;
  }
  
  const deleted = memories.splice(index, 1)[0];
  saveMemories(memories);
  
  console.log(`🗑️  已删除记忆:`);
  console.log(`   ID: ${deleted.id}`);
  console.log(`   内容: ${deleted.content.substring(0, 50)}...`);
  console.log(`   原优先级: ${deleted.priority}`);
  
  return true;
}

// 2. remember - 添加/升级记忆
async function remember(content, options = {}) {
  const { priority = 'P1', tags = [], source = 'manual' } = options;
  
  const memories = loadMemories();
  
  // 检查是否已存在相似内容
  const existing = memories.find(m => 
    m.content.toLowerCase().includes(content.toLowerCase()) ||
    content.toLowerCase().includes(m.content.toLowerCase())
  );
  
  if (existing) {
    // 升级现有记忆
    existing.priority = priority;
    existing.tags = [...new Set([...existing.tags, ...tags])];
    existing.updatedAt = new Date().toISOString();
    existing.upgradeCount = (existing.upgradeCount || 0) + 1;
    
    saveMemories(memories);
    console.log(`⬆️  已升级现有记忆:`);
    console.log(`   ID: ${existing.id}`);
    console.log(`   新优先级: ${priority}`);
    console.log(`   升级次数: ${existing.upgradeCount}`);
    return existing.id;
  }
  
  // 创建新记忆
  const newMemory = {
    id: generateId(),
    content,
    priority,
    tags,
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accessCount: 0,
    lastAccessed: null
  };
  
  memories.push(newMemory);
  saveMemories(memories);
  
  console.log(`💾 已添加新记忆:`);
  console.log(`   ID: ${newMemory.id}`);
  console.log(`   优先级: ${priority}`);
  console.log(`   内容: ${content.substring(0, 50)}...`);
  
  return newMemory.id;
}

// 3. search - 搜索记忆
async function search(query, options = {}) {
  const { limit = 10, priority = null } = options;
  
  const memories = loadMemories();
  
  // 简单关键词匹配（实际应用应使用向量搜索）
  let results = memories.filter(m => {
    const matchContent = m.content.toLowerCase().includes(query.toLowerCase());
    const matchTags = m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()));
    const matchPriority = priority ? m.priority === priority : true;
    return (matchContent || matchTags) && matchPriority;
  });
  
  // 排序：优先级 > 访问次数 > 更新时间
  results.sort((a, b) => {
    const pMap = { 'P0': 3, 'P1': 2, 'P2': 1 };
    if (pMap[b.priority] !== pMap[a.priority]) {
      return pMap[b.priority] - pMap[a.priority];
    }
    if (b.accessCount !== a.accessCount) {
      return b.accessCount - a.accessCount;
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  
  results = results.slice(0, limit);
  
  console.log(`🔍 搜索结果: "${query}"`);
  console.log(`   找到 ${results.length} 条记忆\n`);
  
  results.forEach((m, i) => {
    console.log(`${i + 1}. [${m.priority}] ${m.content.substring(0, 60)}...`);
    console.log(`   ID: ${m.id}`);
    console.log(`   标签: ${m.tags.join(', ') || '无'}`);
    console.log(`   访问: ${m.accessCount}次 | 更新: ${new Date(m.updatedAt).toLocaleDateString()}`);
    console.log('');
  });
  
  return results;
}

// 4. show - 显示记忆详情
async function show(memoryId) {
  const memories = loadMemories();
  const memory = memories.find(m => m.id === memoryId);
  
  if (!memory) {
    console.log(`❌ 记忆未找到: ${memoryId}`);
    return null;
  }
  
  // 更新访问统计
  memory.accessCount++;
  memory.lastAccessed = new Date().toISOString();
  saveMemories(memories);
  
  console.log(`📄 记忆详情:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`ID:          ${memory.id}`);
  console.log(`优先级:       ${memory.priority}`);
  console.log(`标签:         ${memory.tags.join(', ') || '无'}`);
  console.log(`来源:         ${memory.source}`);
  console.log(`创建时间:     ${new Date(memory.createdAt).toLocaleString()}`);
  console.log(`更新时间:     ${new Date(memory.updatedAt).toLocaleString()}`);
  console.log(`访问次数:     ${memory.accessCount}`);
  console.log(`最后访问:     ${memory.lastAccessed ? new Date(memory.lastAccessed).toLocaleString() : '从未'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`内容:`);
  console.log(memory.content);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return memory;
}

// 5. list - 列出所有记忆
async function list(options = {}) {
  const { priority = null, limit = 20 } = options;
  
  let memories = loadMemories();
  
  if (priority) {
    memories = memories.filter(m => m.priority === priority);
  }
  
  // 排序
  memories.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  memories = memories.slice(0, limit);
  
  console.log(`📋 记忆列表 (共 ${memories.length} 条):\n`);
  
  memories.forEach((m, i) => {
    const date = new Date(m.updatedAt).toLocaleDateString();
    console.log(`${i + 1}. [${m.priority}] ${m.content.substring(0, 50)}...`);
    console.log(`   ID: ${m.id} | 访问: ${m.accessCount} | ${date}`);
  });
  
  return memories;
}

// 6. stats - 统计信息
async function stats() {
  const memories = loadMemories();
  
  const p0Count = memories.filter(m => m.priority === 'P0').length;
  const p1Count = memories.filter(m => m.priority === 'P1').length;
  const p2Count = memories.filter(m => m.priority === 'P2').length;
  
  const totalAccess = memories.reduce((sum, m) => sum + (m.accessCount || 0), 0);
  
  const oldest = memories.length > 0 ? new Date(Math.min(...memories.map(m => new Date(m.createdAt)))) : null;
  const newest = memories.length > 0 ? new Date(Math.max(...memories.map(m => new Date(m.updatedAt)))) : null;
  
  console.log(`📊 记忆系统统计`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`总记忆数:    ${memories.length}`);
  console.log(`  P0 (永久):  ${p0Count} (${(p0Count/memories.length*100).toFixed(1)}%)`);
  console.log(`  P1 (长期):  ${p1Count} (${(p1Count/memories.length*100).toFixed(1)}%)`);
  console.log(`  P2 (临时):  ${p2Count} (${(p2Count/memories.length*100).toFixed(1)}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`总访问次数:   ${totalAccess}`);
  console.log(`平均访问/条:  ${memories.length > 0 ? (totalAccess/memories.length).toFixed(2) : 0}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`最早记忆:     ${oldest ? oldest.toLocaleDateString() : 'N/A'}`);
  console.log(`最新更新:     ${newest ? newest.toLocaleDateString() : 'N/A'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// CLI 路由
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  try {
    switch (cmd) {
      case 'forget':
        await forget(args[1]);
        break;
        
      case 'remember':
        const content = args[1];
        const priority = args.includes('--priority') ? args[args.indexOf('--priority') + 1] : 'P1';
        const tags = args.includes('--tags') ? args[args.indexOf('--tags') + 1].split(',') : [];
        await remember(content, { priority, tags });
        break;
        
      case 'search':
        const query = args[1];
        const searchLimit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
        const searchPriority = args.includes('--priority') ? args[args.indexOf('--priority') + 1] : null;
        await search(query, { limit: searchLimit, priority: searchPriority });
        break;
        
      case 'show':
        await show(args[1]);
        break;
        
      case 'list':
        const listPriority = args.includes('--priority') ? args[args.indexOf('--priority') + 1] : null;
        const listLimit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 20;
        await list({ priority: listPriority, limit: listLimit });
        break;
        
      case 'stats':
        await stats();
        break;
        
      default:
        console.log(`
🧠 Dual-Memory v4.0 - 主动记忆干预

Commands:
  forget <id>                    删除记忆
  remember "内容" --priority P0  添加/升级记忆
  search "关键词" --limit 10     搜索记忆
  show <id>                      显示记忆详情
  list --priority P0             列出记忆
  stats                          统计信息

Examples:
  node cli.js forget abc123
  node cli.js remember "用户喜欢草莓甜甜圈" --priority P0 --tags food,preference
  node cli.js search "OpenClaw" --limit 5
  node cli.js show abc123
  node cli.js list --priority P0
  node cli.js stats
`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = { forget, remember, search, show, list, stats };

if (require.main === module) {
  main();
}