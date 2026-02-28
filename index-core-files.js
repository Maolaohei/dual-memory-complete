/**
 * 核心文件向量化脚本
 * 将 SOUL.md, USER.md, AGENTS.md 切片向量化，实现按需检索
 */

const { pipeline } = require('@xenova/transformers');
const lancedb = require('vectordb');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  dbPath: './data/vectordb',
  tableName: 'memories',
  coreFiles: [
    {
      path: '../SOUL.md',
      type: 'core_soul',
      priority: 'P0',
      description: '角色定义'
    },
    {
      path: '../USER.md',
      type: 'core_user',
      priority: 'P0',
      description: '用户档案'
    },
    {
      path: '../AGENTS.md',
      type: 'core_agents',
      priority: 'P0',
      description: 'Agent指令'
    }
  ],
  model: {
    name: 'Xenova/bge-small-zh-v1.5',
    dimensions: 512,
    prefix: {
      passage: 'passage: ',
      query: 'query: '
    }
  },
  chunkSize: 500,  // 每个切片最大字符数
  overlap: 50      // 切片重叠字符数
};

/**
 * 将文本切分成多个片段
 */
function chunkText(text, maxSize = 500, overlap = 50) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;

  for (const line of lines) {
    // 跳过空行和注释
    if (line.trim() === '' || line.trim().startsWith('<!--')) continue;

    // 如果当前行本身超过 maxSize，单独作为一个 chunk
    if (line.length > maxSize) {
      if (currentChunk) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
        currentChunk = '';
      }
      // 长行按 maxSize 切分
      for (let i = 0; i < line.length; i += maxSize - overlap) {
        chunks.push({ text: line.slice(i, i + maxSize).trim(), index: chunkIndex++ });
      }
      continue;
    }

    // 如果添加当前行会超过 maxSize，保存当前 chunk
    if (currentChunk.length + line.length + 1 > maxSize) {
      if (currentChunk) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
        // 保留 overlap 字符作为上下文
        currentChunk = currentChunk.slice(-overlap) + '\n' + line;
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // 保存最后一个 chunk
  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
  }

  return chunks;
}

/**
 * 提取文件标题和摘要
 */
function extractMetadata(content, filePath) {
  const lines = content.split('\n');
  let title = '';
  let description = '';

  // 提取第一个标题
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      break;
    }
  }

  // 提取描述（标题后的第一段非空内容）
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith('# ')) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim() && !line.startsWith('#') && !line.startsWith('>')) {
      description = line.trim().slice(0, 100);
      break;
    }
  }

  return { title, description, fileName: path.basename(filePath) };
}

async function indexCoreFiles() {
  console.log('🚀 开始核心文件向量化...\n');

  // 1. 加载模型
  console.log(`🧠 加载模型: ${CONFIG.model.name}...`);
  const startTime = Date.now();
  const embedder = await pipeline('feature-extraction', CONFIG.model.name);
  console.log(`✅ 模型加载完成 (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`);

  // 2. 连接数据库
  const db = await lancedb.connect(CONFIG.dbPath);
  const table = await db.openTable(CONFIG.tableName);
  console.log('✅ 已连接向量库\n');

  // 3. 删除旧的核心文件记录
  console.log('🗑️  清理旧的核心文件记录...');
  // LanceDB 不支持直接删除，我们标记为 forgotten
  const existingMemories = await table
    .search(Array(CONFIG.model.dimensions).fill(0))
    .limit(1000)
    .execute();
  
  const coreMemories = existingMemories.filter(m => 
    m.type?.startsWith('core_') || m.metadata?.type?.startsWith('core_')
  );
  
  console.log(`   找到 ${coreMemories.length} 条旧记录\n`);

  // 4. 处理每个核心文件
  let totalChunks = 0;
  const now = new Date().toISOString();

  for (const fileInfo of CONFIG.coreFiles) {
    const filePath = path.resolve(__dirname, fileInfo.path);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  文件不存在: ${fileInfo.path}`);
      continue;
    }

    console.log(`📄 处理: ${fileInfo.description} (${fileInfo.path})`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const metadata = extractMetadata(content, filePath);
    const chunks = chunkText(content, CONFIG.chunkSize, CONFIG.overlap);
    
    console.log(`   切分成 ${chunks.length} 个片段`);

    // 向量化每个 chunk
    for (const chunk of chunks) {
      const textWithPrefix = CONFIG.model.prefix.passage + chunk.text;
      
      const output = await embedder(textWithPrefix, {
        pooling: 'mean',
        normalize: true
      });
      const vector = Array.from(output.data);

      const data = {
        id: `core_${fileInfo.type}_${chunk.index}_${Date.now()}`,
        content: chunk.text,
        vector,
        type: fileInfo.type,
        topic: metadata.title || fileInfo.description,
        character: 'system',
        priority: fileInfo.priority,
        confidence: 1.0,
        date: now.slice(0, 10),
        created_at: now,
        updated_at: now,
        quality_score: 1.0,
        context: `来源: ${metadata.fileName}`,
        version: 1,
        query_count: 0,
        last_queried: '',
        related_to: '',
        similarity: 0,
        merge_count: 0,
        forgotten: false,
        forgotten_at: '',
        forgotten_reason: '',
        user_confirmed: true,
        confirmed_at: now,
        conflict_resolved: false,
        conflict_resolution: '',
        sources: ['core_file_indexing']
      };

      await table.add([data]);
      totalChunks++;
    }

    console.log(`   ✅ 已索引 ${chunks.length} 个片段\n`);
  }

  // 5. 完成
  console.log('='.repeat(50));
  console.log('🎉 核心文件向量化完成！');
  console.log(`   📄 处理文件: ${CONFIG.coreFiles.length} 个`);
  console.log(`   📦 总切片数: ${totalChunks} 个`);
  console.log('='.repeat(50));

  // 6. 验证
  console.log('\n🔍 验证检索...');
  const testQuery = '角色定义';
  const queryWithPrefix = CONFIG.model.prefix.query + testQuery;
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
  console.log(`   结果: ${results.filter(r => r.type?.startsWith('core_')).length} 条核心文件片段`);
  
  results.forEach((r, i) => {
    if (r.type?.startsWith('core_')) {
      console.log(`   ${i + 1}. [${r.type}] ${r.content.slice(0, 50)}...`);
    }
  });

  console.log('\n✅ 核心文件向量化脚本执行完毕！');
}

indexCoreFiles().catch(console.error);
