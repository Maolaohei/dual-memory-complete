/**
 * MemoryBridge - OpenClaw 记忆桥接器
 * 桥接 LanceDB 向量记忆与 MEMORY.md 原生记忆
 */

const { MemoryStore } = require('./memory-store');
const fs = require('fs').promises;
const path = require('path');

class MemoryBridge {
  /**
   * @param {Object} options
   * @param {string} options.dbPath - LanceDB 路径
   * @param {string} options.tableName - 表名
   * @param {string} options.memoryMdPath - MEMORY.md 路径
   * @param {string} options.memoryDir - 记忆目录
   */
  constructor(options = {}) {
    this.store = new MemoryStore({
      dbPath: options.dbPath || './lancedb',
      tableName: options.tableName || 'memories'
    });
    this.memoryMdPath = options.memoryMdPath || '../../MEMORY.md';
    this.memoryDir = options.memoryDir || '../../memory';
    this.autoSync = options.autoSync !== false; // 默认开启
  }

  /**
   * 初始化
   */
  async initialize() {
    await this.store.initialize();
  }

  /**
   * 添加长期记忆（带同步）
   * @param {string} content - 记忆内容
   * @param {Object} metadata - 元数据
   * @param {boolean} syncToMd - 是否同步到 MEMORY.md
   * @returns {string} - 记忆ID
   */
  async addLongTermMemory(content, metadata = {}, syncToMd = true) {
    // 添加到向量库
    const memoryId = await this.store.addMemory(content, metadata);

    // 同步到 MEMORY.md
    if (syncToMd && this.autoSync) {
      await this._syncToMemoryMd(content, metadata);
    }

    return memoryId;
  }

  /**
   * 搜索记忆（带同步到今日记忆）
   * @param {string} query - 查询内容
   * @param {number} nResults - 结果数量
   * @param {boolean} autoSync - 是否同步到今日记忆
   * @returns {Array} - 搜索结果
   */
  async searchAndRemember(query, nResults = 3, autoSync = true) {
    const results = await this.store.search(query, nResults);

    // 同步到今日记忆
    if (autoSync && results.length > 0) {
      await this._syncSearchToDaily(query, results);
    }

    return results;
  }

  /**
   * 同步到 MEMORY.md
   * @private
   */
  async _syncToMemoryMd(content, metadata) {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      
      // 构建元数据字符串
      const metaItems = [];
      if (metadata.type) metaItems.push(`type=${metadata.type}`);
      if (metadata.topic) metaItems.push(`topic=${metadata.topic}`);
      if (metadata.character) metaItems.push(`character=${metadata.character}`);
      if (metadata.priority) metaItems.push(`priority=${metadata.priority}`);
      
      const metaStr = metaItems.length > 0 ? ` (${metaItems.join(', ')})` : '';
      
      // 构建条目
      const entry = `\n## [${timestamp}]${metaStr}\n${content}\n`;
      
      // 追加到 MEMORY.md
      const mdPath = path.resolve(this.store.dbPath, this.memoryMdPath);
      await fs.appendFile(mdPath, entry, 'utf-8');
      
    } catch (e) {
      console.warn(`⚠️ 同步到 MEMORY.md 失败: ${e.message}`);
    }
  }

  /**
   * 同步搜索到今日记忆
   * @private
   */
  async _syncSearchToDaily(query, results) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dailyPath = path.resolve(this.store.dbPath, this.memoryDir, `${today}.md`);
      
      // 确保目录存在
      await fs.mkdir(path.dirname(dailyPath), { recursive: true });
      
      // 构建记录
      const lines = [`\n## 记忆检索 [${new Date().toTimeString().slice(0, 5)}]`];
      lines.push(`**查询**: ${query}`);
      lines.push('');
      
      results.forEach((r, i) => {
        const content = r.content.length > 200 
          ? r.content.slice(0, 200) + '...' 
          : r.content;
        lines.push(`${i + 1}. ${content}`);
      });
      
      lines.push('');
      
      // 追加写入
      await fs.appendFile(dailyPath, lines.join('\n'), 'utf-8');
      
    } catch (e) {
      console.warn(`⚠️ 同步到每日记忆失败: ${e.message}`);
    }
  }

  /**
   * 导入 MEMORY.md 到向量库
   */
  async importFromMemoryMd() {
    const mdPath = path.resolve(this.store.dbPath, this.memoryMdPath);
    
    try {
      const content = await fs.readFile(mdPath, 'utf-8');
      
      // 解析记忆条目: ## [日期] [优先级] (type=xxx, topic=xxx)
      const pattern = /##\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*\(([^)]+)\)\s*\n([^#]+?)(?=##|\Z)/g;
      const memories = [];
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const [_, dateStr, priority, metadataStr, contentText] = match;
        
        // 解析元数据
        const metadata = {};
        metadataStr.split(',').forEach(item => {
          if (item.includes('=')) {
            const [key, value] = item.trim().split('=', 2);
            metadata[key.trim()] = value.trim();
          }
        });
        
        metadata.priority = priority;
        metadata.date = dateStr;
        metadata.imported_at = new Date().toISOString();
        
        const cleanContent = contentText.trim();
        if (cleanContent) {
          memories.push({ content: cleanContent, metadata });
        }
      }
      
      console.log(`📊 找到 ${memories.length} 条记忆待导入`);
      
      // 导入记忆
      let success = 0;
      for (let i = 0; i < memories.length; i++) {
        const mem = memories[i];
        try {
          await this.store.addMemory(mem.content, mem.metadata);
          success++;
          console.log(`✅ [${i+1}/${memories.length}] ${mem.content.slice(0, 50)}...`);
        } catch (e) {
          console.error(`❌ [${i+1}/${memories.length}] 导入失败: ${e.message}`);
        }
      }
      
      console.log(`\n🎉 导入完成! 成功: ${success}/${memories.length}`);
      return { total: memories.length, success };
      
    } catch (e) {
      console.error(`❌ 读取 MEMORY.md 失败: ${e.message}`);
      return { total: 0, success: 0 };
    }
  }
}

module.exports = { MemoryBridge };
