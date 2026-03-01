#!/usr/bin/env node
/**
 * 迁移脚本: v5 → v6 多表结构
 * 
 * 功能：
 * 1. 创建三个新表 (memories, core_files, skills)
 * 2. 迁移现有 memories 表数据
 * 3. 备份旧表
 */

const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/vectordb');

async function migrate() {
  console.log('🔄 开始迁移到 v6.0 多表结构...\n');
  
  // 连接数据库
  const db = await lancedb.connect(DB_PATH);
  
  // 1. 检查旧表是否存在
  let oldTable = null;
  try {
    oldTable = await db.openTable('memories');
    const oldCount = await oldTable.countRows();
    console.log(`📊 发现旧 memories 表: ${oldCount} 条记录`);
  } catch (e) {
    console.log('⚠️  未发现旧 memories 表，跳过迁移');
    return;
  }
  
  // 2. 导出旧数据
  console.log('\n📦 导出旧数据...');
  const oldData = await oldTable
    .filter('id IS NOT NULL')
    .limit(10000)
    .execute();
  
  console.log(`   导出 ${oldData.length} 条记录`);
  
  // 3. 分类数据
  const memoriesData = oldData.filter(r => 
    r.type !== 'system' && 
    r.content !== 'system_marker' &&
    !r.id?.startsWith('file_') &&
    !r.id?.startsWith('skill::')
  );
  
  const filesData = oldData.filter(r => 
    r.id?.startsWith('file_') || r.file_name
  );
  
  const skillsData = oldData.filter(r => 
    r.id?.startsWith('skill::') || r.skill_name
  );
  
  console.log(`   - 记忆数据: ${memoriesData.length} 条`);
  console.log(`   - 文件切片: ${filesData.length} 条`);
  console.log(`   - Skill索引: ${skillsData.length} 条`);
  
  // 4. 备份旧表
  console.log('\n💾 备份旧表...');
  const backupDir = path.join(__dirname, '../data/vectordb-backup-v5-' + Date.now());
  fs.mkdirSync(backupDir, { recursive: true });
  
  // 导出为 JSON
  const backupFile = path.join(backupDir, 'memories_export.json');
  fs.writeFileSync(backupFile, JSON.stringify(oldData, null, 2));
  console.log(`   备份已保存: ${backupFile}`);
  
  // 5. 创建新表结构
  console.log('\n📁 创建新表结构...');
  
  // 删除旧表
  try {
    await db.dropTable('memories');
    console.log('   已删除旧 memories 表');
  } catch (e) {
    // 忽略
  }
  
  // 创建新表（使用空 schema）
  const dimensions = oldData[0]?.vector?.length || 512;
  const now = new Date().toISOString();
  
  // memories 表
  const memoriesSchema = [{
    id: 'initial_marker',
    content: 'system_marker',
    vector: Array(dimensions).fill(0),
    type: 'system',
    topic: '',
    character: '',
    priority: 'P3',
    confidence: 1.0,
    date: now.slice(0, 10),
    created_at: now,
    updated_at: now,
    quality_score: 1.0,
    query_count: 0,
    last_queried: '',
    forgotten: false,
    sources: ['']
  }];
  
  const memoriesTable = await db.createTable('memories', memoriesSchema);
  console.log('   ✅ 创建 memories 表');
  
  // core_files 表
  const filesSchema = [{
    id: 'initial_marker',
    content: 'system_marker',
    vector: Array(dimensions).fill(0),
    file_name: 'system',
    section: 'system',
    chunk_index: 0,
    hash: 'system',
    created_at: now,
    updated_at: now
  }];
  
  const filesTable = await db.createTable('core_files', filesSchema);
  console.log('   ✅ 创建 core_files 表');
  
  // skills 表
  const skillsSchema = [{
    id: 'initial_marker',
    content: 'system_marker',
    vector: Array(dimensions).fill(0),
    skill_name: 'system',
    display_name: 'System',
    description: 'System marker',
    triggers: [''],
    capabilities: [''],
    examples: [''],
    created_at: now,
    updated_at: now
  }];
  
  const skillsTable = await db.createTable('skills', skillsSchema);
  console.log('   ✅ 创建 skills 表');
  
  // 6. 迁移数据
  console.log('\n📤 迁移数据...');
  
  if (memoriesData.length > 0) {
    await memoriesTable.add(memoriesData);
    console.log(`   ✅ 迁移记忆: ${memoriesData.length} 条`);
  }
  
  if (filesData.length > 0) {
    // 转换格式
    const convertedFiles = filesData.map(r => ({
      id: r.id,
      content: r.content,
      vector: r.vector,
      file_name: r.file_name || 'unknown',
      section: r.section || '',
      chunk_index: r.chunk_index || 0,
      hash: r.hash || '',
      created_at: r.created_at || now,
      updated_at: now
    }));
    await filesTable.add(convertedFiles);
    console.log(`   ✅ 迁移文件切片: ${filesData.length} 条`);
  }
  
  if (skillsData.length > 0) {
    // 转换格式
    const convertedSkills = skillsData.map(r => ({
      id: r.id,
      content: r.content,
      vector: r.vector,
      skill_name: r.skill_name || r.id?.replace('skill::', '') || 'unknown',
      display_name: r.display_name || r.skill_name || 'Unknown',
      description: r.description || r.content || '',
      triggers: r.triggers || [],
      capabilities: r.capabilities || [],
      examples: r.examples || [],
      created_at: r.created_at || now,
      updated_at: now
    }));
    await skillsTable.add(convertedSkills);
    console.log(`   ✅ 迁移Skill索引: ${skillsData.length} 条`);
  }
  
  // 7. 验证
  console.log('\n🔍 验证迁移结果...');
  const newStats = {
    memories: await memoriesTable.countRows(),
    core_files: await filesTable.countRows(),
    skills: await skillsTable.countRows()
  };
  
  console.log(`   - memories: ${newStats.memories} 条`);
  console.log(`   - core_files: ${newStats.core_files} 条`);
  console.log(`   - skills: ${newStats.skills} 条`);
  
  console.log('\n✅ 迁移完成！');
  console.log(`   备份位置: ${backupDir}`);
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err);
  process.exit(1);
});