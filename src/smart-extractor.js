/**
 * SmartExtractor - 智能记忆提取器
 * 更灵活、更智能的信息提取
 */

class SmartExtractor {
  constructor() {
    // 动态学习的关键词权重
    this.keywordWeights = {
      // 高权重 - 几乎一定是重要信息
      high: [
        '喜欢', '讨厌', '最爱', '偏好', '讨厌', '厌恶', '害怕',
        '必须', '一定', '不要', '禁止', '不能', '务必',
        '记住', '切记', '别忘了', '重要的是',
        '密码', '密钥', 'token', 'api', '账号', '用户名',
        '生日', '纪念日', '节日'
      ],
      // 中权重 - 可能是重要信息
      medium: [
        '习惯', '经常', '总是', '从不', '偶尔',
        '认为', '觉得', '想', '希望', '愿望',
        '工作', '公司', '职位', '职业',
        '家', '住址', '地址', '位置',
        '家人', '朋友', '同事', '伴侣', '配偶'
      ],
      // 低权重 - 需要结合上下文
      low: [
        '吃', '喝', '玩', '去', '来', '有',
        '好', '坏', '大', '小', '新', '旧'
      ]
    };

    // 语义模式 - 更灵活的匹配
    this.semanticPatterns = [
      // 偏好模式
      {
        name: 'preference',
        patterns: [
          /(?:我|吾主|用户|他|她).*?(?:喜欢|爱|偏好|钟情于|迷恋|最爱).*?([^。！？,，]+)/,
          /(?:不喜欢|讨厌|厌恶|反感|拒绝).*?([^。！？,，]+)/,
          /([^。！？,，]+).*?(?:最好吃|最棒|最赞|最优秀|最推荐)/
        ],
        weight: 3
      },
      // 事实模式
      {
        name: 'fact',
        patterns: [
          /(?:是|为|在|有).*?([^。！？,，]{5,30})/,
          /(?:住在|位于|来自|毕业于|就职于).*?([^。！？,，]{3,20})/,
          /(?:生日|出生日期|成立时间).*?(\d{4}[年/-]\d{1,2}[月/-]\d{1,2})/
        ],
        weight: 2
      },
      // 规则/指令模式
      {
        name: 'rule',
        patterns: [
          /(?:必须|应该|要|得|务必|一定).*?([^。！？,，]{5,40})/,
          /(?:不要|禁止|不能|别|勿).*?([^。！？,，]{5,40})/,
          /(?:记住|切记|别忘了|记得).*?([^。！？,，]{5,40})/
        ],
        weight: 3
      },
      // 配置/设置模式
      {
        name: 'config',
        patterns: [
          /(?:配置|设置|参数|选项).*?[:：]\s*([^。！？\n]+)/,
          /([a-zA-Z_]+)\s*[=:]\s*([^。！？,，\s]+)/
        ],
        weight: 3
      },
      // 人物关系模式
      {
        name: 'relationship',
        patterns: [
          /(?:妈妈|爸爸|父亲|母亲|父母|家人).*?(?:是|叫|名为).*?([^。！？,，]{2,10})/,
          /(?:朋友|同事|老板|下属|伴侣|配偶).*?(?:是|叫|名为).*?([^。！？,，]{2,10})/,
          /(?:和|与).*?(?:是|关系|认识).*?([^。！？,，]{3,20})/
        ],
        weight: 2
      }
    ];
  }

  /**
   * 计算记忆价值分数
   * @param {string} text - 文本内容
   * @returns {number} - 0-10 的分数
   */
  calculateValue(text) {
    let score = 0;
    const lowerText = text.toLowerCase();

    // 关键词权重计算
    for (const keyword of this.keywordWeights.high) {
      if (text.includes(keyword)) score += 2;
    }
    for (const keyword of this.keywordWeights.medium) {
      if (text.includes(keyword)) score += 1;
    }
    for (const keyword of this.keywordWeights.low) {
      if (text.includes(keyword)) score += 0.3;
    }

    // 语义模式匹配
    for (const pattern of this.semanticPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          score += pattern.weight;
          break;
        }
      }
    }

    // 文本特征加分
    if (text.length >= 10 && text.length <= 200) score += 1; // 合适长度
    if (/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(text)) score += 2; // 包含日期
    if (/\d+\s*(岁|年|年 old)/.test(text)) score += 1; // 包含年龄
    if (/^[我是吾主用户]/.test(text)) score += 1; // 第一人称

    // 减分项
    if (text.length < 5) score -= 2; // 太短
    if (/\?|？/.test(text)) score -= 1; // 问句
    if (/^(什么|怎么|为什么|谁|哪里)/.test(text)) score -= 2; // 疑问句

    return Math.min(Math.max(score, 0), 10);
  }

  /**
   * 智能提取记忆
   * @param {string} text - 原始文本
   * @returns {Array<{content: string, type: string, confidence: number}>}
   */
  extract(text) {
    const memories = [];
    
    // 1. 使用语义模式提取
    for (const patternGroup of this.semanticPatterns) {
      for (const pattern of patternGroup.patterns) {
        const matches = text.matchAll(new RegExp(pattern, 'g'));
        for (const match of matches) {
          const content = match[1] || match[0];
          const cleanContent = this._cleanContent(content);
          
          if (cleanContent.length >= 5 && cleanContent.length <= 100) {
            const confidence = this._calculateConfidence(cleanContent, patternGroup.name);
            
            memories.push({
              content: cleanContent,
              type: patternGroup.name,
              confidence: confidence,
              source: 'pattern'
            });
          }
        }
      }
    }

    // 2. 按句子分析
    const sentences = text.split(/[。！？\n]+/).filter(s => s.trim().length > 0);
    
    for (const sentence of sentences) {
      const score = this.calculateValue(sentence);
      
      // 分数足够高，但没有被模式提取到
      if (score >= 5 && !memories.some(m => sentence.includes(m.content))) {
        const cleanContent = this._cleanContent(sentence);
        
        memories.push({
          content: cleanContent,
          type: this._inferType(sentence),
          confidence: Math.min(score / 3, 3), // 转换为 1-3 级
          source: 'scoring'
        });
      }
    }

    // 3. 去重和排序
    const unique = this._deduplicate(memories);
    unique.sort((a, b) => b.confidence - a.confidence);

    return unique.slice(0, 5); // 最多返回 5 条
  }

  /**
   * 清理内容
   * @private
   */
  _cleanContent(content) {
    return content
      .replace(/^[,，\s]+|[,，\s]+$/g, '') // 去除首尾标点空格
      .replace(/\s+/g, ' ') // 合并空格
      .trim();
  }

  /**
   * 计算置信度
   * @private
   */
  _calculateConfidence(content, type) {
    let base = 2; // 模式匹配基础分
    
    // 根据内容质量调整
    if (content.length >= 10) base += 0.5;
    if (content.length >= 20) base += 0.5;
    if (/\d/.test(content)) base += 0.3; // 包含数字（日期、年龄等）
    
    return Math.min(base, 3);
  }

  /**
   * 推断类型
   * @private
   */
  _inferType(text) {
    if (/喜欢|爱|偏好|讨厌/.test(text)) return 'preference';
    if (/是|为|有|在/.test(text) && !/[做要需]/.test(text)) return 'fact';
    if (/必须|应该|要|不要|禁止/.test(text)) return 'rule';
    if (/设置|配置|参数/.test(text)) return 'config';
    if (/家人|朋友|同事|妈妈|爸爸/.test(text)) return 'relationship';
    return 'general';
  }

  /**
   * 去重
   * @private
   */
  _deduplicate(memories) {
    const seen = new Set();
    return memories.filter(m => {
      const key = m.content.slice(0, 30); // 前30字符作为去重键
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 是否应该记住
   * @param {string} text - 文本
   * @param {number} threshold - 阈值 (默认 4)
   * @returns {boolean}
   */
  shouldRemember(text, threshold = 4) {
    const score = this.calculateValue(text);
    return score >= threshold;
  }
}

module.exports = { SmartExtractor };
