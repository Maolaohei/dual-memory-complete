/**
 * AutoStore - 自动记忆提取系统
 * 从对话中自动识别并存储重要信息
 */

const { MemoryBridge } = require('./memory-bridge');
const { SmartExtractor } = require('./smart-extractor');

class AutoStore {
  constructor(bridge = null) {
    this.bridge = bridge;
    this.extractor = new SmartExtractor();
    this._initialized = false;
  }

  /**
   * 初始化
   */
  async initialize() {
    if (!this.bridge) {
      this.bridge = new MemoryBridge();
      await this.bridge.initialize();
    } else if (!this.bridge.store._initialized) {
      await this.bridge.initialize();
    }
    this._initialized = true;
  }

  /**
   * 判断是否值得记住
   * @param {string} text - 文本内容
   * @param {number} threshold - 阈值 (0-10)
   * @returns {boolean}
   */
  shouldRemember(text, threshold = 4) {
    return this.extractor.shouldRemember(text, threshold);
  }

  /**
   * 提取关键信息 (使用 SmartExtractor)
   * @param {string} text - 文本内容
   * @returns {Array<{content: string, type: string, confidence: number}>}
   */
  extractKeyInfo(text) {
    return this.extractor.extract(text);
  }

  /**
   * 自动存储记忆
   * @param {string} content - 对话内容
   * @param {string} source - 来源
   * @returns {Array<{id: string, content: string, type: string}>|null} - 存储的记忆列表
   */
  async autoStoreMemory(content, source = 'conversation') {
    if (!this._initialized) {
      await this.initialize();
    }

    // 判断是否值得记住
    if (!this.shouldRemember(content)) {
      return null;
    }

    try {
      // 提取关键信息 (使用 SmartExtractor)
      const extracted = this.extractKeyInfo(content);
      
      if (extracted.length === 0) {
        return null;
      }

      const memories = [];
      
      for (const item of extracted) {
        const memoryId = await this.bridge.addLongTermMemory(
          item.content,
          {
            type: item.type,
            source: source,
            auto_extracted: true,
            confidence: item.confidence,
            extraction_source: item.source,
            timestamp: new Date().toISOString()
          },
          true // 同步到 MD
        );
        memories.push({
          id: memoryId,
          content: item.content,
          type: item.type,
          confidence: item.confidence
        });
      }

      return memories;
      
    } catch (e) {
      console.error(`⚠️ 自动存储记忆失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 对话结束钩子
   * @param {string} conversationText - 完整对话文本
   * @returns {Array<string>|null}
   */
  async onConversationEnd(conversationText) {
    return await this.autoStoreMemory(conversationText, 'conversation');
  }

  /**
   * 分析文本（不存储，仅返回分析结果）
   * @param {string} text - 文本
   * @returns {Object}
   */
  analyze(text) {
    const score = this.extractor.calculateValue(text);
    const extracted = this.extractor.extract(text);
    
    return {
      score: score,
      should_remember: score >= 4,
      threshold: 4,
      extracted_count: extracted.length,
      extracted: extracted
    };
  }
}

module.exports = { AutoStore };
