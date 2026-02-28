/**
 * 迁移脚本: mpnet (768维) → bge-small-zh (512维)
 * 
 * 步骤:
 * 1. 备份旧向量库
 * 2. 删除旧表
 * 3. 用新模型重新嵌入所有记忆
 * 4. 写入新表
 */

const { pipeline } = require('@xenova/transformers');
const lancedb = require('vectordb');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  dbPath: './data/vectordb',
  tableName: 'memories',
  backupPath: './data/vectordb-backup-mpnet-768dim-' + new Date().toISOString().slice(0, 10),
  exportFile: 'memories_export.json',
  newModel: {
    name: 'Xenova/bge-small-zh-v1.5',
    dimensions: 512,
    prefix: {
      passage: 'passage: ',
      query: 'query: '
    }
  }
};

async function migrate() {
  console.log('🚀 开始迁移: mpnet (768维) → bge-small-zh (512维)\n');

  // 1. 检查导出文件
  if (!fs.existsSync(CONFIG.exportFile)) {
    console.error('❌ 未找到导出文件:', CONFIG.exportFile);
    console.log('请先运行: node -e "..." 导出记忆');
    process.exit(1);
  }

  const memories = JSON.parse(fs.readFileSync(CONFIG.exportFile, 'utf8'));
  console.log(`📦 已加载 ${memories.length} 条记忆\n`);

  // 2. 备份旧向量库
  console.log('💾 备份旧向量库...');
  if (fs.existsSync(CONFIG.dbPath)) {
    // 简单复制
    fs.cpSync(CONFIG.dbPath, CONFIG.backupPath, { recursive: true });
    console.log(`✅ 已备份到: ${CONFIG.backupPath}\n`);
  }

  // 3. 加载新模型
  console.log(`🧠 加载新模型: ${CONFIG.newModel.name} (${CONFIG.newModel.dimensions}维)...`);
  const startTime = Date.now();
  const embedder = await pipeline('feature-extraction', CONFIG.newModel.name);
  const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ 模型加载完成 (${loadTime}s)\n`);

  // 4. 连接数据库并删除旧表
  console.log('🗑️  删除旧表...');
  const db = await lancedb.connect(CONFIG.dbPath);
  try {
    await db.dropTable(CONFIG.tableName);
    console.log('✅ 旧表已删除\n');
  } catch (e) {
    console.log('⚠️  表不存在，跳过删除\n');
  }

  // 5. 创建新表 (带完整 schema)
  console.log('📝 创建新表...');
  const now = new Date().toISOString();
  const emptyData = [{
    id: 'initial_marker',
    content: 'system_marker',
    vector: Array(CONFIG.newModel.dimensions).fill(0),
    type: 'system',
    topic: 'system',
    character: 'system',
    priority: 'P3',
    confidence: 1.0,
    date: now.slice(0, 10),
    created_at: now,
    updated_at: now,
    quality_score: 1.0,
    context: '',
    version: 1,
    query_count: 0,
    last_queried: '',
    related_to: '',
    similarity: 0,
    merge_count: 0,
    forgotten: false,
    forgotten_at: '',
    forgotten_reason: '',
    user_confirmed: false,
    confirmed_at: '',
    conflict_resolved: false,
    conflict_resolution: '',
    sources: ['']
  }];
  const table = await db.createTable(CONFIG.tableName, emptyData);
  console.log('✅ 新表已创建\n');

  // 6. 重新嵌入所有记忆
  console.log('🔄 开始重新嵌入...\n');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < memories.length; i++) {
    const mem = memories[i];
    const progress = `[${i + 1}/${memories.length}]`;
    
    try {
      // 添加 passage 前缀
      const textWithPrefix = CONFIG.newModel.prefix.passage + mem.content;
      
      // 生成向量
      const output = await embedder(textWithPrefix, {
        pooling: 'mean',
        normalize: true
      });
      const vector = Array.from(output.data);

      // 准备数据
      const timestamp = mem.created_at || now;
      const dateStr = timestamp.replace(/[-:T.Z]/g, '').slice(0, 14);
      const random = Math.floor(Math.random() * 10000);
      
      const data = {
        id: `mem_${dateStr}_${random}`,
        content: mem.content,
        vector,
        type: mem.type || 'general',
        topic: mem.topic || '',
        character: mem.character || '',
        priority: mem.priority || 'P1',
        confidence: mem.confidence || 1.0,
        date: mem.date || now.slice(0, 10),
        created_at: mem.created_at || now,
        updated_at: now,
        quality_score: 0.5,
        context: '',
        version: 1,
        query_count: 0,
        last_queried: '',
        related_to: '',
        similarity: 0,
        merge_count: 0,
        forgotten: false,
        forgotten_at: '',
        forgotten_reason: '',
        user_confirmed: false,
        confirmed_at: '',
        conflict_resolved: false,
        conflict_resolution: '',
        sources: ['migration']
      };

      await table.add([data]);
      successCount++;
      
      // 每10条显示进度
      if ((i + 1) % 10 === 0 || i === memories.length - 1) {
        console.log(`${progress} ✅ 已处理 ${successCount} 条`);
      }
    } catch (error) {
      errorCount++;
      console.error(`${progress} ❌ 失败: ${error.message}`);
    }
  }

  // 7. 完成
  console.log('\n' + '='.repeat(50));
  console.log('🎉 迁移完成！');
  console.log(`   ✅ 成功: ${successCount} 条`);
  console.log(`   ❌ 失败: ${errorCount} 条`);
  console.log(`   📊 新维度: ${CONFIG.newModel.dimensions}`);
  console.log(`   💾 备份位置: ${CONFIG.backupPath}`);
  console.log('='.repeat(50));

  // 8. 验证
  console.log('\n🔍 验证迁移结果...');
  const count = await table.countRows();
  console.log(`   📁 表中记录数: ${count} (含 system_marker)`);

  // 测试检索
  console.log('\n🧪 测试检索...');
  const testQuery = '甜甜圈';
  const queryWithPrefix = CONFIG.newModel.prefix.query + testQuery;
  const queryOutput = await embedder(queryWithPrefix, {
    pooling: 'mean',
    normalize: true
  });
  const queryVector = Array.from(queryOutput.data);
  
  const results = await table
    .search(queryVector)
    .limit(3)
    .execute();
  
  console.log(`   查询: "${testQuery}"`);
  console.log(`   结果: ${results.length} 条`);
  results.forEach((r, i) => {
    if (r.content !== 'system_marker') {
      console.log(`   ${i + 1}. ${r.content.slice(0, 50)}...`);
    }
  });

  console.log('\n✅ 迁移脚本执行完毕！');
}

migrate().catch(console.error);
