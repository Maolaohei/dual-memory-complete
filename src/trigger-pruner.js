/**
 * TriggerPruner - 触发词修剪机制 v6.0
 * 
 * 问题25解决方案：触发词无限累积，摘要索引预算会被撑破
 * 
 * 功能：
 * 1. 限制触发词数量上限
 * 2. AI 选择最有代表性的触发词
 * 3. 自动修剪
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { safeParseJson } = require('./safe-parse');

const MAX_TRIGGERS = 20;  // 每个 Skill 最多 20 个触发词

class TriggerPruner {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || path.resolve(__dirname, '../../skills');
    this.metaDir = options.metaDir || path.join(this.skillsDir, 'meta');
    this.maxTriggers = options.maxTriggers || MAX_TRIGGERS;
    this.llmComplete = options.llmComplete || null;
  }

  /**
   * 检查并修剪触发词
   */
  async pruneIfNeeded(skillName) {
    const meta = await this._loadMeta(skillName);
    
    if (!meta || !meta.triggers || meta.triggers.length <= this.maxTriggers) {
      return { pruned: false, count: meta?.triggers?.length || 0 };
    }
    
    console.log(`[Pruner] ${skillName} 触发词超限: ${meta.triggers.length} > ${this.maxTriggers}`);
    
    // 执行修剪
    const prunedTriggers = await this._selectBestTriggers(skillName, meta.triggers);
    
    // 更新元数据
    meta.triggers = prunedTriggers;
    await this._saveMeta(skillName, meta);
    
    // 同步更新摘要索引
    await this._updateIndex(skillName, prunedTriggers);
    
    console.log(`[Pruner] ${skillName} 触发词已修剪: ${meta.triggers.length} → ${prunedTriggers.length}`);
    
    return { pruned: true, before: meta.triggers.length, after: prunedTriggers.length };
  }

  /**
   * 选择最好的触发词
   */
  async _selectBestTriggers(skillName, triggers) {
    // 如果有 LLM，让 AI 选择
    if (this.llmComplete) {
      try {
        const prompt = `以下是技能"${skillName}"的触发词列表，请从中选出最有代表性、覆盖面最广的${this.maxTriggers}个：

${triggers.join('\n')}

只返回 JSON 数组，例如：["触发词1", "触发词2"]`;

        const raw = await this.llmComplete(prompt);
        const selected = safeParseJson(raw, null);
        
        if (Array.isArray(selected) && selected.length > 0) {
          return selected.slice(0, this.maxTriggers);
        }
      } catch (err) {
        console.warn(`[Pruner] AI 选择失败，使用简单策略:`, err.message);
      }
    }
    
    // 简单策略：按长度和多样性选择
    return this._simpleSelect(triggers);
  }

  /**
   * 简单选择策略
   */
  _simpleSelect(triggers) {
    // 1. 去重
    const unique = [...new Set(triggers)];
    
    // 2. 按长度排序（中等长度的通常更有代表性）
    const sorted = unique.sort((a, b) => {
      const scoreA = this._scoreTrigger(a);
      const scoreB = this._scoreTrigger(b);
      return scoreB - scoreA;
    });
    
    // 3. 选择前 N 个，确保多样性
    const selected = [];
    for (const trigger of sorted) {
      if (selected.length >= this.maxTriggers) break;
      
      // 检查是否与已选的太相似
      const tooSimilar = selected.some(s => 
        this._similarity(s, trigger) > 0.8
      );
      
      if (!tooSimilar) {
        selected.push(trigger);
      }
    }
    
    return selected;
  }

  /**
   * 给触发词打分
   */
  _scoreTrigger(trigger) {
    const len = trigger.length;
    
    // 太短或太长的都不好
    // 最佳长度：2-6 个字符
    if (len >= 2 && len <= 6) {
      return 10 - Math.abs(len - 4);
    }
    
    if (len < 2) return 1;
    if (len > 10) return 2;
    return 5;
  }

  /**
   * 简单相似度计算
   */
  _similarity(a, b) {
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    
    // 字符重叠率
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter(c => setB.has(c)).length;
    const union = new Set([...setA, ...setB]).size;
    
    return intersection / union;
  }

  /**
   * 加载元数据
   */
  async _loadMeta(skillName) {
    const metaPath = path.join(this.metaDir, `${skillName}.json`);
    
    if (!fsSync.existsSync(metaPath)) {
      return null;
    }
    
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * 保存元数据
   */
  async _saveMeta(skillName, meta) {
    if (!fsSync.existsSync(this.metaDir)) {
      await fs.mkdir(this.metaDir, { recursive: true });
    }
    
    const metaPath = path.join(this.metaDir, `${skillName}.json`);
    meta.pruned_at = new Date().toISOString();
    
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * 更新摘要索引
   */
  async _updateIndex(skillName, triggers) {
    const indexPath = path.join(this.skillsDir, 'index.json');
    
    if (!fsSync.existsSync(indexPath)) {
      return;
    }
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);
      
      if (index[skillName]) {
        index[skillName].triggers = triggers;
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn(`[Pruner] 更新索引失败:`, err.message);
    }
  }

  /**
   * 批量修剪所有 Skill
   */
  async pruneAll() {
    if (!fsSync.existsSync(this.metaDir)) {
      return { total: 0, pruned: 0 };
    }
    
    const files = fsSync.readdirSync(this.metaDir)
      .filter(f => f.endsWith('.json'));
    
    let prunedCount = 0;
    
    for (const file of files) {
      const skillName = file.replace('.json', '');
      const result = await this.pruneIfNeeded(skillName);
      if (result.pruned) {
        prunedCount++;
      }
    }
    
    console.log(`[Pruner] 批量修剪完成: ${prunedCount}/${files.length}`);
    
    return {
      total: files.length,
      pruned: prunedCount
    };
  }
}

module.exports = { TriggerPruner, MAX_TRIGGERS };