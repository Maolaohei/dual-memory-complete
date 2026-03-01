/**
 * SkillInstaller - Skill 安装自动注册 v6.0
 * 
 * 功能：
 * 1. 安装时调用 LLM 提炼元数据
 * 2. 元数据写入 skills/meta/xxx.json（永久缓存）
 * 3. 只有手动执行 nanobot skill reindex 才重跑
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class SkillInstaller {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || path.resolve(__dirname, '../../skills');
    this.metaDir = options.metaDir || path.resolve(__dirname, '../data/skills/meta');
    this.llmProvider = options.llmProvider || null; // 注入 LLM provider
  }

  /**
   * 安装 Skill（提取元数据并缓存）
   */
  async install(skillPath) {
    const skillName = path.basename(skillPath);
    const metaPath = path.join(this.metaDir, `${skillName}.json`);

    // 1. 检查是否已有缓存
    if (fsSync.existsSync(metaPath)) {
      console.log(`  ✅ Skill 元数据已缓存: ${skillName}`);
      return JSON.parse(fsSync.readFileSync(metaPath, 'utf-8'));
    }

    // 2. 读取 Skill 文件
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!fsSync.existsSync(skillMdPath)) {
      throw new Error(`Skill 文件不存在: ${skillMdPath}`);
    }

    const skillContent = await fs.readFile(skillMdPath, 'utf-8');

    // 3. 调用 LLM 提炼元数据
    console.log(`  🤖 提炼 Skill 元数据: ${skillName}...`);
    const metadata = await this._extractMetadata(skillName, skillContent);

    // 4. 缓存元数据
    await this._saveMeta(metaPath, metadata);
    console.log(`  ✅ 元数据已缓存: ${metaPath}`);

    return metadata;
  }

  /**
   * 使用 LLM 提炼元数据
   */
  async _extractMetadata(skillName, skillContent) {
    // 如果没有 LLM provider，使用简单提取
    if (!this.llmProvider) {
      return this._simpleExtract(skillName, skillContent);
    }

    const prompt = `分析以下 Skill 文件，提取结构化元数据：

---
${skillContent.slice(0, 2000)}
---

请提取以下信息（JSON 格式）：
{
  "name": "skill 名称",
  "display_name": "显示名称",
  "description": "一句话描述（不超过50字）",
  "triggers": ["触发词1", "触发词2"],
  "capabilities": ["能力1", "能力2"],
  "examples": ["使用示例1", "使用示例2"],
  "priority": "P1/P2/P3"
}

只返回 JSON，不要其他内容。`;

    try {
      const response = await this.llmProvider.chat(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.warn(`  ⚠️ LLM 提取失败，使用简单提取: ${err.message}`);
    }

    return this._simpleExtract(skillName, skillContent);
  }

  /**
   * 简单提取（不调用 LLM）
   */
  _simpleExtract(skillName, skillContent) {
    // 从 frontmatter 提取
    const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';

    // 解析 YAML（简单版）
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    // 从内容提取触发词
    const triggersMatch = frontmatter.match(/triggers:\s*\n(\s+-\s+.+\n?)+/);
    let triggers = [];
    if (triggersMatch) {
      triggers = triggersMatch[0]
        .split('\n')
        .filter(line => line.includes('- '))
        .map(line => line.replace(/^\s*-\s*/, '').trim());
    }

    return {
      name: nameMatch ? nameMatch[1].trim() : skillName,
      display_name: nameMatch ? nameMatch[1].trim() : skillName,
      description: descMatch ? descMatch[1].trim() : `Skill: ${skillName}`,
      triggers: triggers.length > 0 ? triggers : [skillName],
      capabilities: [],
      examples: [],
      priority: 'P2',
      extracted_at: new Date().toISOString(),
      method: 'simple'
    };
  }

  /**
   * 保存元数据
   */
  async _saveMeta(metaPath, metadata) {
    // 确保目录存在
    const dir = path.dirname(metaPath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    metadata.cached_at = new Date().toISOString();
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * 重新索引所有 Skill
   */
  async reindexAll() {
    console.log('🔄 重新索引所有 Skill...');

    // 清空缓存
    if (fsSync.existsSync(this.metaDir)) {
      const files = fsSync.readdirSync(this.metaDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fsSync.unlinkSync(path.join(this.metaDir, file));
        }
      }
    }

    // 重新安装所有 Skill
    const skills = fsSync.readdirSync(this.skillsDir);
    const results = [];

    for (const skillName of skills) {
      const skillPath = path.join(this.skillsDir, skillName);
      if (fsSync.statSync(skillPath).isDirectory()) {
        try {
          const meta = await this.install(skillPath);
          results.push({ skillName, status: 'success', meta });
        } catch (err) {
          results.push({ skillName, status: 'error', error: err.message });
        }
      }
    }

    console.log(`✅ 重新索引完成: ${results.filter(r => r.status === 'success').length}/${results.length}`);
    return results;
  }

  /**
   * 获取已缓存的 Skill 元数据
   */
  getCachedMeta(skillName) {
    const metaPath = path.join(this.metaDir, `${skillName}.json`);
    if (fsSync.existsSync(metaPath)) {
      return JSON.parse(fsSync.readFileSync(metaPath, 'utf-8'));
    }
    return null;
  }

  /**
   * 列出所有已缓存的 Skill
   */
  listCached() {
    if (!fsSync.existsSync(this.metaDir)) {
      return [];
    }

    return fsSync.readdirSync(this.metaDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const meta = JSON.parse(fsSync.readFileSync(path.join(this.metaDir, f), 'utf-8'));
        return {
          name: meta.name,
          description: meta.description,
          triggers: meta.triggers,
          cached_at: meta.cached_at
        };
      });
  }
}

module.exports = { SkillInstaller };