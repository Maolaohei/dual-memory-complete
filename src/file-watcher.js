/**
 * FileWatcher - 核心文件变更监听
 * 
 * 功能：
 * 1. 使用 fs.watch 监听文件变更（不依赖 chokidar）
 * 2. MD5 哈希检测内容变化
 * 3. 增量同步向量库
 * 4. file_index.json 索引管理
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileWatcher {
  constructor(store, options = {}) {
    this.store = store;
    this.isActive = false;
    this.watchers = [];
    
    // 配置
    this.config = {
      indexPath: options.indexPath || path.resolve(__dirname, '../data/file_index.json'),
      debounceMs: options.debounceMs || 1000, // 防抖
      ...options
    };
    
    // 核心文件列表
    this.coreFiles = [
      { path: path.resolve(__dirname, '../../memory/SOUL.md'), type: 'core_soul', priority: 'P0' },
      { path: path.resolve(__dirname, '../../memory/USER.md'), type: 'core_user', priority: 'P0' },
      { path: path.resolve(__dirname, '../../memory/AGENTS.md'), type: 'core_agents', priority: 'P0' }
    ];
    
    // 文件索引
    this.fileIndex = {};
    
    // 防抖计时器
    this._debounceTimers = new Map();
  }

  /**
   * 启动监听
   */
  async start() {
    if (this.isActive) return;

    console.log('📂 FileWatcher 启动中...');

    // 1. 加载现有索引
    await this._loadIndex();

    // 2. 启动时全量检查一次
    for (const fileConfig of this.coreFiles) {
      await this._syncFile(fileConfig);
    }

    // 3. 启动文件监听
    for (const fileConfig of this.coreFiles) {
      this._watchFile(fileConfig);
    }

    this.isActive = true;
    console.log('✅ FileWatcher 已启动');
  }

  /**
   * 停止监听
   */
  stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.isActive = false;
    console.log('🛑 FileWatcher 已停止');
  }

  /**
   * 监听单个文件
   */
  _watchFile(fileConfig) {
    const filePath = fileConfig.path;
    
    if (!fsSync.existsSync(filePath)) {
      console.warn(`  ⚠️ 文件不存在: ${path.basename(filePath)}`);
      return;
    }

    const watcher = fsSync.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        // 防抖处理
        this._debounce(filePath, () => {
          console.log(`📝 检测到变更: ${path.basename(filePath)}`);
          this._syncFile(fileConfig);
        });
      }
    });

    watcher.on('error', (err) => {
      console.error(`  ❌ 监听失败: ${path.basename(filePath)}`, err.message);
    });

    this.watchers.push(watcher);
    console.log(`  👀 监听: ${path.basename(filePath)}`);
  }

  /**
   * 防抖处理
   */
  _debounce(key, callback) {
    if (this._debounceTimers.has(key)) {
      clearTimeout(this._debounceTimers.get(key));
    }
    this._debounceTimers.set(key, setTimeout(() => {
      this._debounceTimers.delete(key);
      callback();
    }, this.config.debounceMs));
  }

  /**
   * 同步单个文件
   */
  async _syncFile(fileConfig) {
    const { path: filePath, type, priority } = fileConfig;
    
    try {
      // 检查文件是否存在
      if (!fsSync.existsSync(filePath)) {
        return;
      }

      // 读取内容
      const content = await fs.readFile(filePath, 'utf-8');
      const fileHash = this._hashContent(content);

      // 检查是否有变化
      const existingIndex = this.fileIndex[filePath];
      if (existingIndex && existingIndex.hash === fileHash) {
        // 没有变化，跳过
        return;
      }

      console.log(`  🔄 同步: ${path.basename(filePath)}`);

      // 语义感知切片
      const newChunks = this._semanticChunk(content, filePath, type, priority);
      const prevChunks = existingIndex?.chunks || [];

      // 计算差异
      const prevIds = new Set(prevChunks.map(c => c.id));
      const newIds = new Set(newChunks.map(c => c.id));

      // 删除旧切片
      const toDelete = prevChunks.filter(c => !newIds.has(c.id));
      if (toDelete.length > 0) {
        await this._deleteChunks(toDelete);
        console.log(`    🗑️ 删除: ${toDelete.length} 条旧切片`);
      }

      // 新增切片
      const toAdd = newChunks.filter(c => !prevIds.has(c.id));
      if (toAdd.length > 0) {
        await this._addChunks(toAdd);
        console.log(`    ✅ 新增: ${toAdd.length} 条切片`);
      }

      // 更新索引
      this.fileIndex[filePath] = {
        hash: fileHash,
        chunks: newChunks.map(c => ({
          id: c.id,
          hash: c.hash,
          topic: c.topic
        })),
        updated_at: new Date().toISOString()
      };

      await this._saveIndex();
      console.log(`  ✅ 同步完成: ${path.basename(filePath)}`);

    } catch (err) {
      console.error(`  ❌ 同步失败: ${path.basename(filePath)}`, err.message);
    }
  }

  /**
   * 语义感知切片（按标题/段落切，带重叠）
   */
  _semanticChunk(content, filePath, type, priority) {
    const chunks = [];
    const sections = content.split(/(?=^## )/m);
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section.trim().length < 20) continue;

      // 提取标题
      const titleMatch = section.match(/^##\s+(.+)$/m);
      const topic = titleMatch ? titleMatch[1].trim() : 'intro';

      // 带上下文重叠（前后各拼一段）
      const prev = i > 0 ? sections[i - 1].slice(-100) : '';
      const next = i < sections.length - 1 ? sections[i + 1].slice(0, 100) : '';
      const chunkWithContext = prev + section + next;

      // 核心内容（不含重叠）
      const coreContent = section.trim();

      chunks.push({
        id: `${type}::${this._hashContent(coreContent)}`,
        content: chunkWithContext,
        core_content: coreContent,
        source: filePath,
        type,
        priority,
        topic,
        hash: this._hashContent(coreContent),
        created_at: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        confidence: 8,
        query_count: 0
      });
    }

    return chunks;
  }

  /**
   * 删除切片
   */
  async _deleteChunks(chunks) {
    if (!this.store || !this.store.table) return;

    try {
      const ids = chunks.map(c => c.id);
      // LanceDB 删除语法
      await this.store.table.delete(`id IN ('${ids.join("','")}')`);
    } catch (err) {
      // 可能不存在，忽略错误
    }
  }

  /**
   * 新增切片
   */
  async _addChunks(chunks) {
    if (!this.store || !this.store.table) return;

    // 为每个切片生成向量
    const chunksWithVectors = [];
    for (const chunk of chunks) {
      try {
        const vector = await this.store._embed(chunk.content);
        chunksWithVectors.push({
          ...chunk,
          vector
        });
      } catch (err) {
        console.error(`    ⚠️ 向量化失败: ${chunk.id}`);
      }
    }

    if (chunksWithVectors.length > 0) {
      await this.store.table.add(chunksWithVectors);
    }
  }

  /**
   * 计算内容哈希
   */
  _hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 加载索引
   */
  async _loadIndex() {
    try {
      const data = await fs.readFile(this.config.indexPath, 'utf-8');
      this.fileIndex = JSON.parse(data);
      console.log('  ✅ 加载文件索引');
    } catch (err) {
      // 索引不存在，使用空对象
      this.fileIndex = {};
    }
  }

  /**
   * 保存索引
   */
  async _saveIndex() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.config.indexPath);
      if (!fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(
        this.config.indexPath,
        JSON.stringify(this.fileIndex, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('  ❌ 保存索引失败:', err.message);
    }
  }

  /**
   * 手动触发全量同步
   */
  async syncAll() {
    console.log('🔄 执行全量同步...');
    for (const fileConfig of this.coreFiles) {
      await this._syncFile(fileConfig);
    }
    console.log('✅ 全量同步完成');
  }

  /**
   * 获取索引状态
   */
  getStatus() {
    return {
      isActive: this.isActive,
      watchedFiles: this.coreFiles.map(f => path.basename(f.path)),
      indexSize: Object.keys(this.fileIndex).length,
      totalChunks: Object.values(this.fileIndex)
        .reduce((sum, idx) => sum + (idx.chunks?.length || 0), 0)
    };
  }
}

module.exports = { FileWatcher };
