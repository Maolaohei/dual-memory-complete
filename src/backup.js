/**
 * BackupManager - 数据备份机制 v6.0
 * 
 * 问题27解决方案：无数据备份和恢复机制
 * 
 * 功能：
 * 1. 自动备份关键数据
 * 2. 保留最近 N 份备份
 * 3. 自动清理旧备份
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const DEFAULT_BACKUP_DIR = 'backups';
const MAX_BACKUPS = 7;  // 保留最近 7 份备份

class BackupManager {
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.resolve(__dirname, '../backups');
    this.maxBackups = options.maxBackups || MAX_BACKUPS;
    this.workspaceDir = options.workspaceDir || path.resolve(__dirname, '../..');
    
    // 需要备份的关键数据
    this.backupTargets = [
      'dual-memory-complete/data/experiences/',
      'skills/meta/',
      'skills/index.json',
      'memory/SOUL_CORE.md',
      'memory/USER.md',
      'memory/optimizations.json',
      'memory/HISTORY.md',
      'context-override.json'
    ];
  }

  /**
   * 创建备份
   */
  async createBackup(reason = 'manual') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${timestamp}_${reason}`;
    const backupPath = path.join(this.backupDir, backupName);
    
    console.log(`[Backup] 开始备份: ${backupName}`);
    
    // 确保备份目录存在
    await fs.mkdir(backupPath, { recursive: true });
    
    let successCount = 0;
    let failCount = 0;
    
    for (const target of this.backupTargets) {
      const sourcePath = path.join(this.workspaceDir, target);
      
      try {
        if (fsSync.existsSync(sourcePath)) {
          const stat = fsSync.statSync(sourcePath);
          
          if (stat.isDirectory()) {
            await this._copyDir(sourcePath, path.join(backupPath, path.basename(target)));
          } else {
            await fs.copyFile(sourcePath, path.join(backupPath, path.basename(target)));
          }
          
          successCount++;
        }
      } catch (err) {
        console.warn(`[Backup] 备份失败: ${target}`, err.message);
        failCount++;
      }
    }
    
    // 写入备份元信息
    const metaInfo = {
      timestamp,
      reason,
      successCount,
      failCount,
      targets: this.backupTargets
    };
    await fs.writeFile(
      path.join(backupPath, '_backup_meta.json'),
      JSON.stringify(metaInfo, null, 2),
      'utf-8'
    );
    
    console.log(`[Backup] 备份完成: ${successCount} 成功, ${failCount} 失败`);
    
    // 清理旧备份
    await this.cleanOldBackups();
    
    return {
      name: backupName,
      path: backupPath,
      successCount,
      failCount
    };
  }

  /**
   * 复制目录
   */
  async _copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this._copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 清理旧备份
   */
  async cleanOldBackups() {
    if (!fsSync.existsSync(this.backupDir)) {
      return;
    }
    
    const backups = fsSync.readdirSync(this.backupDir)
      .filter(f => {
        const stat = fsSync.statSync(path.join(this.backupDir, f));
        return stat.isDirectory() && !f.startsWith('.');
      })
      .sort()
      .reverse();  // 最新的在前
    
    // 删除超出数量的旧备份
    const toDelete = backups.slice(this.maxBackups);
    
    for (const old of toDelete) {
      const oldPath = path.join(this.backupDir, old);
      await fs.rm(oldPath, { recursive: true, force: true });
      console.log(`[Backup] 已清理旧备份: ${old}`);
    }
    
    return {
      kept: backups.length - toDelete.length,
      deleted: toDelete.length
    };
  }

  /**
   * 列出所有备份
   */
  listBackups() {
    if (!fsSync.existsSync(this.backupDir)) {
      return [];
    }
    
    return fsSync.readdirSync(this.backupDir)
      .filter(f => {
        const stat = fsSync.statSync(path.join(this.backupDir, f));
        return stat.isDirectory() && !f.startsWith('.');
      })
      .sort()
      .reverse()
      .map(name => {
        const metaPath = path.join(this.backupDir, name, '_backup_meta.json');
        let meta = null;
        
        try {
          if (fsSync.existsSync(metaPath)) {
            meta = JSON.parse(fsSync.readFileSync(metaPath, 'utf-8'));
          }
        } catch {}
        
        return {
          name,
          path: path.join(this.backupDir, name),
          meta,
          createdAt: fsSync.statSync(path.join(this.backupDir, name)).birthtime
        };
      });
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupName) {
    const backupPath = path.join(this.backupDir, backupName);
    
    if (!fsSync.existsSync(backupPath)) {
      throw new Error(`备份不存在: ${backupName}`);
    }
    
    console.log(`[Backup] 开始恢复: ${backupName}`);
    
    let successCount = 0;
    let failCount = 0;
    
    const entries = await fs.readdir(backupPath);
    
    for (const entry of entries) {
      if (entry === '_backup_meta.json') continue;
      
      const sourcePath = path.join(backupPath, entry);
      
      // 找到对应的目标位置
      for (const target of this.backupTargets) {
        if (path.basename(target) === entry) {
          const destPath = path.join(this.workspaceDir, target);
          
          try {
            const stat = fsSync.statSync(sourcePath);
            
            if (stat.isDirectory()) {
              await this._copyDir(sourcePath, destPath);
            } else {
              await fs.copyFile(sourcePath, destPath);
            }
            
            successCount++;
          } catch (err) {
            console.warn(`[Backup] 恢复失败: ${entry}`, err.message);
            failCount++;
          }
          
          break;
        }
      }
    }
    
    console.log(`[Backup] 恢复完成: ${successCount} 成功, ${failCount} 失败`);
    
    return { successCount, failCount };
  }

  /**
   * 获取备份统计
   */
  getStats() {
    const backups = this.listBackups();
    
    let totalSize = 0;
    for (const backup of backups) {
      totalSize += this._getDirSize(backup.path);
    }
    
    return {
      count: backups.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      oldestBackup: backups[backups.length - 1]?.name || null,
      newestBackup: backups[0]?.name || null
    };
  }

  /**
   * 计算目录大小
   */
  _getDirSize(dirPath) {
    let size = 0;
    
    const entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        size += this._getDirSize(fullPath);
      } else {
        size += fsSync.statSync(fullPath).size;
      }
    }
    
    return size;
  }
}

module.exports = { BackupManager, MAX_BACKUPS };