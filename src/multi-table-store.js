/**
 * MultiTableStore - 多表向量存储系统 (v6.0)
 * 
 * 支持三个独立的 collection，避免检索污染：
 * - memories: 对话记忆向量
 * - core_files: 核心文件切片向量  
 * - skills: Skill语义索引向量
 */

const { pipeline } = require('@xenova/transformers');
const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs');

// 加载配置
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../config/default.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (e) {
    console.warn('⚠️  无法加载配置，使用默认值');
    return {
      embedding: {
        current: 'bge-small-zh',
        models: {
          'bge-small-zh': { name: 'Xenova/bge-small-zh-v1.5', dimensions: 512 }
        }
      },
      paths: {
        dbPath: './data/vectordb',
        tables: {
          memories: '对话记忆向量',
          core_files: '核心文件切片向量',
          skills: 'Skill语义索引向量'
        }
      }
    };
  }
}

class MultiTableStore {
  constructor(options = {}) {
    this.config = loadConfig();
    this.dbPath = options.dbPath || this.config.paths?.dbPath || './data/vectordb';
    
    // 表名定义
    this.tableNames = Object.keys(this.config.paths?.tables || {
      memories: true,
      core_files: true,
      skills: true
    });
    
    // 获取当前模型配置
    const currentModelKey = this.config.embedding?.current || 'bge-small-zh';
    this.modelConfig = this.config.embedding?.models?.[currentModelKey] || 
                       { name: 'Xenova/bge-small-zh-v1.5', dimensions: 512 };
    
    this.dimensions = this.modelConfig.dimensions || 512;
    this.modelName = this.modelConfig.name || 'Xenova/bge-small-zh-v1.5';
    
    console.log(`📊 MultiTableStore v6.0`);
    console.log(`   模型: ${currentModelKey} (${this.modelName}, ${this.dimensions}维)`);
    console.log(`   表: ${this.tableNames.join(', ')}`);
    
    this.db = null;
    this.tables = {};  // { memories: Table, core_files: Table, skills: Table }
    this._embeddingPipeline = null;
    this._initialized = false;
  }

  /**
   * 初始化所有表
   */
  async initialize() {
    if (this._initialized) return;

    // 1. 加载嵌入模型
    console.log(`🧠 加载 embedding 模型: ${this.modelName}...`);
    this._embeddingPipeline = await pipeline('feature-extraction', this.modelName);
    console.log('✅ 模型加载完成');

    // 2. 连接 LanceDB
    this.db = await lancedb.connect(this.dbPath);

    // 3. 初始化所有表
    for (const tableName of this.tableNames) {
      await this._initTable(tableName);
    }

    this._initialized = true;
    console.log('✅ MultiTableStore 初始化完成');
  }

  /**
   * 初始化单个表
   */
  async _initTable(tableName) {
    try {
      this.tables[tableName] = await this.db.openTable(tableName);
      console.log(`   📁 已打开表: ${tableName}`);
    } catch (e) {
      // 表不存在，创建空表
      const now = new Date().toISOString();
      const emptyData = this._getEmptySchema(tableName, now);
      this.tables[tableName] = await this.db.createTable(tableName, emptyData);
      console.log(`   📁 已创建新表: ${tableName}`);
    }
  }

  /**
   * 获取各表的空 schema
   */
  _getEmptySchema(tableName, now) {
    const baseSchema = {
      id: 'initial_marker',
      content: 'system_marker',
      vector: Array(this.dimensions).fill(0),
      created_at: now,
      updated_at: now
    };

    switch (tableName) {
      case 'memories':
        return [{
          ...baseSchema,
          type: 'system',
          topic: '',
          character: '',
          priority: 'P3',
          confidence: 1.0,
          date: now.slice(0, 10),
          quality_score: 1.0,
          query_count: 0,
          last_queried: '',
          forgotten: false,
          sources: ['']
        }];
      
      case 'core_files':
        return [{
          ...baseSchema,
          file_name: 'system',
          section: 'system',
          chunk_index: 0,
          hash: 'system'
        }];
      
      case 'skills':
        return [{
          ...baseSchema,
          skill_name: 'system',
          display_name: 'System',
          description: 'System marker',
          triggers: [''],
          capabilities: [''],
          examples: ['']
        }];
      
      default:
        return [baseSchema];
    }
  }

  /**
   * 生成文本嵌入
   */
  async _embed(text, mode = 'passage') {
    if (!this._embeddingPipeline) {
      throw new Error('MultiTableStore not initialized. Call initialize() first.');
    }

    let processedText = text;
    if (this.modelConfig.prefix) {
      const prefix = mode === 'query' ? this.modelConfig.prefix.query : this.modelConfig.prefix.passage;
      processedText = prefix + text;
    }

    const output = await this._embeddingPipeline(processedText, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(output.data);
  }

  /**
   * 计算余弦相似度
   */
  _cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  // ==================== 记忆表操作 ====================

  /**
   * 添加记忆
   */
  async addMemory(content, metadata = {}) {
    await this.initialize();
    const table = this.tables['memories'];
    
    const vector = await this._embed(content);
    const id = metadata.id || this._generateId('mem');
    const now = new Date().toISOString();
    
    const data = {
      id,
      content,
      vector,
      type: metadata.type || 'general',
      topic: metadata.topic || '',
      character: metadata.character || '',
      priority: metadata.priority || 'P1',
      confidence: metadata.confidence || 1.0,
      date: metadata.date || now.slice(0, 10),
      created_at: now,
      updated_at: now,
      quality_score: metadata.quality_score || 0.5,
      query_count: 0,
      last_queried: '',
      forgotten: false,
      sources: metadata.sources || ['']
    };
    
    await table.add([data]);
    console.log(`✅ 记忆已添加: ${id.slice(0, 20)}...`);
    return id;
  }

  /**
   * 搜索记忆
   */
  async searchMemories(query, nResults = 5) {
    await this.initialize();
    const table = this.tables['memories'];
    
    const queryVector = await this._embed(query, 'query');
    
    const results = await table
      .search(queryVector)
      .limit(nResults * 2)
      .execute();
    
    return results
      .filter(r => r.type !== 'system' && !r.forgotten)
      .slice(0, nResults)
      .map(r => ({
        id: r.id,
        content: r.content,
        similarity: this._cosineSimilarity(queryVector, r.vector),
        metadata: {
          type: r.type,
          topic: r.topic,
          priority: r.priority,
          date: r.date
        }
      }));
  }

  // ==================== 核心文件表操作 ====================

  /**
   * 添加文件切片
   */
  async addFileChunk(fileName, section, content, chunkIndex, hash) {
    await this.initialize();
    const table = this.tables['core_files'];
    
    const vector = await this._embed(content);
    const id = `file_${hash}_${chunkIndex}`;
    const now = new Date().toISOString();
    
    const data = {
      id,
      content,
      vector,
      file_name: fileName,
      section,
      chunk_index: chunkIndex,
      hash,
      created_at: now,
      updated_at: now
    };
    
    await table.add([data]);
    return id;
  }

  /**
   * 搜索文件切片
   */
  async searchFileChunks(query, nResults = 5) {
    await this.initialize();
    const table = this.tables['core_files'];
    
    const queryVector = await this._embed(query, 'query');
    
    const results = await table
      .search(queryVector)
      .limit(nResults * 2)
      .execute();
    
    return results
      .filter(r => r.file_name !== 'system')
      .slice(0, nResults)
      .map(r => ({
        id: r.id,
        content: r.content,
        similarity: this._cosineSimilarity(queryVector, r.vector),
        metadata: {
          file_name: r.file_name,
          section: r.section,
          chunk_index: r.chunk_index
        }
      }));
  }

  /**
   * 删除文件的所有切片
   */
  async deleteFileChunks(fileName) {
    await this.initialize();
    const table = this.tables['core_files'];
    await table.delete(`file_name = '${fileName}'`);
    console.log(`✅ 已删除文件切片: ${fileName}`);
  }

  // ==================== Skill表操作 ====================

  /**
   * 添加 Skill 索引
   */
  async addSkillIndex(skillName, displayName, description, triggers, capabilities, examples) {
    await this.initialize();
    const table = this.tables['skills'];
    
    const content = `${description} ${capabilities.join(' ')} ${examples.join(' ')}`;
    const vector = await this._embed(content);
    const id = `skill::${skillName}`;
    const now = new Date().toISOString();
    
    const data = {
      id,
      content: description,
      vector,
      skill_name: skillName,
      display_name: displayName,
      description,
      triggers,
      capabilities,
      examples,
      created_at: now,
      updated_at: now
    };
    
    await table.add([data]);
    console.log(`✅ Skill索引已添加: ${skillName}`);
    return id;
  }

  /**
   * 搜索 Skill
   */
  async searchSkills(query, nResults = 3, threshold = 0.75) {
    await this.initialize();
    const table = this.tables['skills'];
    
    const queryVector = await this._embed(query, 'query');
    
    const results = await table
      .search(queryVector)
      .limit(nResults * 2)
      .execute();
    
    return results
      .filter(r => r.skill_name !== 'system')
      .map(r => ({
        skill_name: r.skill_name,
        display_name: r.display_name,
        description: r.description,
        similarity: this._cosineSimilarity(queryVector, r.vector),
        triggers: r.triggers,
        capabilities: r.capabilities
      }))
      .filter(r => r.similarity >= threshold)
      .slice(0, nResults);
  }

  /**
   * 删除 Skill 索引
   */
  async deleteSkillIndex(skillName) {
    await this.initialize();
    const table = this.tables['skills'];
    await table.delete(`skill_name = '${skillName}'`);
    console.log(`✅ 已删除Skill索引: ${skillName}`);
  }

  // ==================== 通用操作 ====================

  /**
   * 获取各表统计
   */
  async getStats() {
    await this.initialize();
    
    const stats = {};
    for (const tableName of this.tableNames) {
      const table = this.tables[tableName];
      stats[tableName] = await table.countRows();
    }
    
    return stats;
  }

  /**
   * 生成唯一ID
   */
  _generateId(prefix = 'mem') {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const random = Math.floor(Math.random() * 10000);
    return `${prefix}_${dateStr}_${timeStr}_${random}`;
  }
}

module.exports = { MultiTableStore };