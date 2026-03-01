/**
 * HistoryArchiver - HISTORY.md 自动归档 v6.0
 * 
 * 问题30解决方案：HISTORY.md 永久增长，无清理机制
 * 
 * 功能：
 * 1. 检测文件大小
 * 2. 归档旧内容
 * 3. 保留最近 N 天
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const MAX_HISTORY_SIZE_MB = 5;  // 超过 5MB 触发归档
const KEEP_DAYS = 30;           // 保留最近 30 天

class HistoryArchiver {
  constructor(options = {}) {
    this.historyFile = options.historyFile || path.resolve(__dirname, '../../memory/HISTORY.md');
    this.archiveDir = options.archiveDir || path.resolve(__dirname, '../../memory/archive');
    this.maxSizeMB = options.maxSizeMB || MAX_HISTORY_SIZE_MB;
    this.keepDays = options.keepDays || KEEP_DAYS;
  }

  /**
   * 检查并归档
   */
  async checkAndArchive() {
    if (!fsSync.existsSync(this.historyFile)) {
      return { archived: false, reason: 'file_not_exist' };
    }
    
    const stat = await fs.stat(this.historyFile);
    const sizeMB = stat.size / 1024 / 1024;
    
    if (sizeMB < this.maxSizeMB) {
      return { archived: false, reason: 'under_limit', sizeMB: sizeMB.toFixed(2) };
    }
    
    console.log(`[Archiver] HISTORY.md 超限: ${sizeMB.toFixed(2)}MB > ${this.maxSizeMB}MB`);
    
    return await this._doArchive();
  }

  /**
   * 执行归档
   */
  async _doArchive() {
    const content = await fs.readFile(this.historyFile, 'utf-8');
    
    // 按章节分割（## 开头）
    const sections = content.split(/^## /m).filter(Boolean);
    
    const cutoffDate = Date.now() - this.keepDays * 24 * 60 * 60 * 1000;
    const recent = [];
    const old = [];
    
    for (const section of sections) {
      // 提取日期
      const dateMatch = section.match(/(\d{4}-\d{2}-\d{2})/);
      
      if (dateMatch) {
        const sectionDate = new Date(dateMatch[1]).getTime();
        
        if (sectionDate < cutoffDate) {
          old.push('## ' + section);
        } else {
          recent.push('## ' + section);
        }
      } else {
        // 没有日期的章节保留
        recent.push('## ' + section);
      }
    }
    
    if (old.length === 0) {
      return { archived: false, reason: 'no_old_content' };
    }
    
    // 确保归档目录存在
    if (!fsSync.existsSync(this.archiveDir)) {
      await fs.mkdir(this.archiveDir, { recursive: true });
    }
    
    // 写入归档文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveFile = path.join(this.archiveDir, `history_${timestamp}.md`);
    
    await fs.writeFile(archiveFile, old.join(''), 'utf-8');
    console.log(`[Archiver] 已归档 ${old.length} 条历史到 ${archiveFile}`);
    
    // HISTORY.md 只保留最近内容
    await fs.writeFile(this.historyFile, recent.join(''), 'utf-8');
    console.log(`[Archiver] HISTORY.md 已精简，当前 ${recent.length} 条`);
    
    // 清理旧归档文件
    await this._cleanOldArchives();
    
    return {
      archived: true,
      archiveFile,
      oldCount: old.length,
      recentCount: recent.length
    };
  }

  /**
   * 清理旧归档文件
   */
  async _cleanOldArchives() {
    if (!fsSync.existsSync(this.archiveDir)) {
      return;
    }
    
    // 归档文件保留 90 天
    const cutoffDate = Date.now() - 90 * 24 * 60 * 60 * 1000;
    
    const files = fsSync.readdirSync(this.archiveDir)
      .filter(f => f.startsWith('history_') && f.endsWith('.md'));
    
    let deleted = 0;
    
    for (const file of files) {
      const filePath = path.join(this.archiveDir, file);
      const stat = fsSync.statSync(filePath);
      
      if (stat.birthtime.getTime() < cutoffDate) {
        await fs.unlink(filePath);
        deleted++;
      }
    }
    
    if (deleted > 0) {
      console.log(`[Archiver] 已清理 ${deleted} 个旧归档文件`);
    }
  }

  /**
   * 获取归档统计
   */
  getStats() {
    const stats = {
      historyFile: {
        exists: false,
        sizeMB: 0,
        lineCount: 0
      },
      archives: []
    };
    
    // 检查 HISTORY.md
    if (fsSync.existsSync(this.historyFile)) {
      const stat = fsSync.statSync(this.historyFile);
      const content = fsSync.readFileSync(this.historyFile, 'utf-8');
      
      stats.historyFile = {
        exists: true,
        sizeMB: (stat.size / 1024 / 1024).toFixed(2),
        lineCount: content.split('\n').length,
        sectionCount: (content.match(/^## /gm) || []).length
      };
    }
    
    // 检查归档文件
    if (fsSync.existsSync(this.archiveDir)) {
      const files = fsSync.readdirSync(this.archiveDir)
        .filter(f => f.startsWith('history_') && f.endsWith('.md'));
      
      stats.archives = files.map(f => {
        const filePath = path.join(this.archiveDir, f);
        const stat = fsSync.statSync(filePath);
        
        return {
          name: f,
          sizeMB: (stat.size / 1024 / 1024).toFixed(2),
          createdAt: stat.birthtime
        };
      });
    }
    
    return stats;
  }

  /**
   * 手动触发归档
   */
  async forceArchive() {
    if (!fsSync.existsSync(this.historyFile)) {
      throw new Error('HISTORY.md 不存在');
    }
    
    return await this._doArchive();
  }

  /**
   * 合并归档文件（可选）
   */
  async mergeArchives() {
    if (!fsSync.existsSync(this.archiveDir)) {
      return { merged: 0 };
    }
    
    const files = fsSync.readdirSync(this.archiveDir)
      .filter(f => f.startsWith('history_') && f.endsWith('.md'))
      .sort();
    
    if (files.length <= 1) {
      return { merged: 0 };
    }
    
    // 合并所有归档到一个文件
    const mergedContent = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(this.archiveDir, file), 'utf-8');
      mergedContent.push(content);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mergedFile = path.join(this.archiveDir, `history_merged_${timestamp}.md`);
    
    await fs.writeFile(mergedFile, mergedContent.join('\n\n'), 'utf-8');
    
    // 删除原文件
    for (const file of files) {
      await fs.unlink(path.join(this.archiveDir, file));
    }
    
    console.log(`[Archiver] 已合并 ${files.length} 个归档文件`);
    
    return { merged: files.length, mergedFile };
  }
}

module.exports = { HistoryArchiver, MAX_HISTORY_SIZE_MB, KEEP_DAYS };