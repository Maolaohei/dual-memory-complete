/**
 * P2 记忆生命周期管理
 * - 30天未访问自动降级
 * - 60天未访问自动归档
 * - 定期压缩合并相似记忆
 */

const { MemoryStoreV3 } = require('./memory-store-v3');
const fs = require('fs').promises;
const path = require('path');

const LIFECYCLE_CONFIG = {
  // P2 记忆生命周期
  p2: {
    downgradeDays: 30,    // 30天未访问降级为 P3
    archiveDays: 60,      // 60天未访问归档
    deleteDays: 90        // 90天未访问删除
  },
  // P3 记忆生命周期
  p3: {
    archiveDays: 14,      // 14天未访问归档
    deleteDays: 30        // 30天未访问删除
  },
  // 相似记忆合并阈值
  merge: {
    similarityThreshold: 0.92,  // 相似度 > 0.92 合并
    minAge: 7                   // 至少存在 7 天才考虑合并
  }
};

class MemoryLifecycle {
  constructor(options = {}) {
    this.store = options.store || null;
    this.config = { ...LIFECYCLE_CONFIG, ...options.config };
    this.archivePath = options.archivePath || './data/archive';
    this.reportPath = options.reportPath || './data/lifecycle-report.json';
  }

  /**
   * 执行生命周期检查
   */
  async runLifecycle() {
    console.log('🔄 开始 P2 记忆生命周期检查...\n');

    if (!this.store) {
      const { MemoryStoreV3 } = require('./memory-store-v3');
      this.store = new MemoryStoreV3();
      await this.store.initialize();
    }

    const stats = {
      timestamp: new Date().toISOString(),
      processed: 0,
      downgraded: 0,
      archived: 0,
      deleted: 0,
      merged: 0,
      errors: []
    };

    try {
      // 1. 获取所有记忆
      const allMemories = await this.store.listMemories(10000);
      const now = Date.now();

      console.log(`📦 检查 ${allMemories.length} 条记忆...\n`);

      // 2. 处理每条记忆
      for (const memory of allMemories) {
        // 跳过系统标记和核心文件
        if (memory.content === 'system_marker' || memory.metadata?.type?.startsWith('core_')) {
          continue;
        }

        stats.processed++;

        const priority = memory.metadata?.priority || 'P2';
        const lastQueried = memory.metadata?.last_queried || memory.metadata?.created_at;
        const daysSinceAccess = lastQueried ? 
          (now - new Date(lastQueried).getTime()) / (1000 * 60 * 60 * 24) : 
          999;

        // P2 记忆生命周期
        if (priority === 'P2') {
          if (daysSinceAccess > this.config.p2.deleteDays) {
            // 删除
            await this.store.forget(memory.id, `P2 记忆 ${daysSinceAccess.toFixed(0)} 天未访问，自动删除`);
            stats.deleted++;
            console.log(`🗑️  删除: ${memory.id.slice(0, 20)}... (${daysSinceAccess.toFixed(0)}天)`);
          } else if (daysSinceAccess > this.config.p2.archiveDays) {
            // 归档
            await this._archiveMemory(memory);
            stats.archived++;
            console.log(`📦 归档: ${memory.id.slice(0, 20)}... (${daysSinceAccess.toFixed(0)}天)`);
          } else if (daysSinceAccess > this.config.p2.downgradeDays) {
            // 降级
            await this._downgradeMemory(memory);
            stats.downgraded++;
            console.log(`⬇️  降级: ${memory.id.slice(0, 20)}... (${daysSinceAccess.toFixed(0)}天)`);
          }
        }

        // P3 记忆生命周期
        if (priority === 'P3') {
          if (daysSinceAccess > this.config.p3.deleteDays) {
            await this.store.forget(memory.id, `P3 记忆 ${daysSinceAccess.toFixed(0)} 天未访问，自动删除`);
            stats.deleted++;
            console.log(`🗑️  删除: ${memory.id.slice(0, 20)}... (${daysSinceAccess.toFixed(0)}天)`);
          } else if (daysSinceAccess > this.config.p3.archiveDays) {
            await this._archiveMemory(memory);
            stats.archived++;
            console.log(`📦 归档: ${memory.id.slice(0, 20)}... (${daysSinceAccess.toFixed(0)}天)`);
          }
        }
      }

      // 3. 合并相似记忆
      console.log('\n🔍 检查相似记忆合并...');
      const merged = await this._mergeSimilarMemories(allMemories);
      stats.merged = merged;

      // 4. 保存报告
      await this._saveReport(stats);

      console.log('\n' + '='.repeat(50));
      console.log('✅ 生命周期检查完成！');
      console.log(`   处理: ${stats.processed} 条`);
      console.log(`   降级: ${stats.downgraded} 条`);
      console.log(`   归档: ${stats.archived} 条`);
      console.log(`   删除: ${stats.deleted} 条`);
      console.log(`   合并: ${stats.merged} 条`);
      console.log('='.repeat(50));

    } catch (error) {
      stats.errors.push(error.message);
      console.error('❌ 生命周期检查失败:', error.message);
    }

    return stats;
  }

  /**
   * 降级记忆
   */
  async _downgradeMemory(memory) {
    try {
      const updates = {
        priority: 'P3',
        downgrade_reason: '30天未访问自动降级',
        downgrade_at: new Date().toISOString()
      };
      await this.store._updateMemoryFields(memory.id, updates);
    } catch (error) {
      console.error(`降级失败: ${memory.id}`, error.message);
    }
  }

  /**
   * 归档记忆
   */
  async _archiveMemory(memory) {
    try {
      // 保存到归档文件
      const archiveFile = path.join(this.archivePath, `${memory.id}.json`);
      await fs.mkdir(this.archivePath, { recursive: true });
      await fs.writeFile(archiveFile, JSON.stringify(memory, null, 2));

      // 标记为已归档
      await this.store._updateMemoryFields(memory.id, {
        archived: true,
        archived_at: new Date().toISOString()
      });
    } catch (error) {
      console.error(`归档失败: ${memory.id}`, error.message);
    }
  }

  /**
   * 合并相似记忆
   */
  async _mergeSimilarMemories(memories) {
    let mergedCount = 0;
    const now = Date.now();
    const minAge = this.config.merge.minAge * 24 * 60 * 60 * 1000;

    // 过滤出可以合并的记忆（存在时间 > minAge）
    const candidates = memories.filter(m => {
      const created = new Date(m.metadata?.created_at).getTime();
      return now - created > minAge && 
             m.content !== 'system_marker' && 
             !m.metadata?.type?.startsWith('core_');
    });

    console.log(`   检查 ${candidates.length} 条候选记忆...`);

    // 两两比较相似度
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const mem1 = candidates[i];
        const mem2 = candidates[j];

        // 简单文本相似度检查（避免向量计算）
        const textSimilarity = this._calculateTextSimilarity(mem1.content, mem2.content);
        
        if (textSimilarity > this.config.merge.similarityThreshold) {
          // 合并到较早的记忆
          const target = mem1.metadata?.created_at < mem2.metadata?.created_at ? mem1 : mem2;
          const source = target === mem1 ? mem2 : mem1;

          // 合并内容
          const mergedContent = `${target.content}\n\n[合并自 ${source.id}]\n${source.content}`;
          
          await this.store._updateMemoryFields(target.id, {
            content: mergedContent,
            merge_count: (target.metadata?.merge_count || 0) + 1
          });

          // 删除源记忆
          await this.store.forget(source.id, `已合并到 ${target.id}`);

          mergedCount++;
          console.log(`   🔗 合并: ${source.id.slice(0, 15)}... → ${target.id.slice(0, 15)}...`);
        }
      }
    }

    return mergedCount;
  }

  /**
   * 计算文本相似度（简单版）
   */
  _calculateTextSimilarity(text1, text2) {
    const s1 = text1.toLowerCase().replace(/\s+/g, '');
    const s2 = text2.toLowerCase().replace(/\s+/g, '');
    
    const chars1 = new Set(s1.split(''));
    const chars2 = new Set(s2.split(''));
    
    const intersection = new Set([...chars1].filter(x => chars2.has(x)));
    const union = new Set([...chars1, ...chars2]);
    
    return intersection.size / union.size;
  }

  /**
   * 保存报告
   */
  async _saveReport(stats) {
    try {
      await fs.writeFile(this.reportPath, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('保存报告失败:', error.message);
    }
  }
}

module.exports = { MemoryLifecycle, LIFECYCLE_CONFIG };
