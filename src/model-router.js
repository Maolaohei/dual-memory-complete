/**
 * ModelRouter - 模型路由 v6.0
 * 
 * 问题28解决方案：模型路由未实现，轻量任务仍用昂贵模型
 * 
 * 功能：
 * 1. 按任务类型路由到合适的模型
 * 2. GLM-5 用于复杂推理
 * 3. GLM-4-Flash 用于简单格式化（便宜 40 倍）
 */

// 模型配置
const MODELS = {
  HEAVY: 'glm-5',           // 4元/M — 复杂推理、创作
  LIGHT: 'glm-4-flash',     // 0.1元/M — 简单格式化、提炼
  BALANCED: 'glm-4'         // 1元/M — 中等复杂度
};

// 轻量任务列表
const LIGHT_TASKS = [
  'trigger_extract',    // 触发词提炼
  'meta_extract',       // Skill元数据提炼
  'summary',            // 对话历史压缩
  'json_format',        // JSON格式化
  'topic_detect',       // 话题切换检测
  'prune_triggers',     // 触发词修剪
  'key_points',         // 关键决策点提取
  'dedup_check',        // 去重检查
  'simple_qa',          // 简单问答
  'translation',        // 翻译
  'sentiment'           // 情感分析
];

// 中等任务列表
const BALANCED_TASKS = [
  'skill_select',       // Skill 选择
  'memory_extract',     // 记忆提取
  'conflict_detect',    // 冲突检测
  'experience_merge'    // 经验合并
];

/**
 * 按任务类型路由到合适的模型
 * @param {string} taskType - 任务类型
 * @returns {string} - 模型名称
 */
function routeModel(taskType) {
  if (LIGHT_TASKS.includes(taskType)) {
    return MODELS.LIGHT;
  }
  
  if (BALANCED_TASKS.includes(taskType)) {
    return MODELS.BALANCED;
  }
  
  return MODELS.HEAVY;
}

/**
 * 根据提示词长度选择模型
 * @param {string} prompt - 提示词
 * @returns {string} - 模型名称
 */
function routeByPromptLength(prompt) {
  const tokens = estimateTokens(prompt);
  
  if (tokens < 500) {
    // 短提示词，通常简单任务
    return MODELS.LIGHT;
  }
  
  if (tokens < 2000) {
    // 中等长度
    return MODELS.BALANCED;
  }
  
  // 长提示词，复杂任务
  return MODELS.HEAVY;
}

/**
 * 根据关键词判断任务复杂度
 */
function routeByKeywords(prompt) {
  const complexKeywords = [
    '分析', '推理', '创作', '设计', '优化',
    '为什么', '如何', '比较', '评估', '决策'
  ];
  
  const simpleKeywords = [
    '提取', '格式化', '转换', '翻译', '总结',
    '是什么', '列出', '分类'
  ];
  
  const promptLower = prompt.toLowerCase();
  
  for (const kw of complexKeywords) {
    if (promptLower.includes(kw)) {
      return MODELS.HEAVY;
    }
  }
  
  for (const kw of simpleKeywords) {
    if (promptLower.includes(kw)) {
      return MODELS.LIGHT;
    }
  }
  
  return MODELS.BALANCED;
}

/**
 * 智能路由（综合判断）
 */
function smartRoute(taskType, prompt) {
  // 1. 优先按任务类型
  if (taskType) {
    const modelByTask = routeModel(taskType);
    if (modelByTask !== MODELS.BALANCED) {
      return modelByTask;
    }
  }
  
  // 2. 按关键词判断
  const modelByKeywords = routeByKeywords(prompt);
  if (modelByKeywords !== MODELS.BALANCED) {
    return modelByKeywords;
  }
  
  // 3. 按长度判断
  return routeByPromptLength(prompt);
}

/**
 * 估算 token 数（简化版）
 */
function estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 获取模型价格信息
 */
function getModelPricing(model) {
  const pricing = {
    [MODELS.HEAVY]: { input: 4, output: 4, unit: '元/M token' },
    [MODELS.BALANCED]: { input: 1, output: 1, unit: '元/M token' },
    [MODELS.LIGHT]: { input: 0.1, output: 0.1, unit: '元/M token' }
  };
  
  return pricing[model] || pricing[MODELS.HEAVY];
}

/**
 * 计算节省的费用
 */
function calculateSavings(tokens, usedModel, optimalModel) {
  const pricing = {
    [MODELS.HEAVY]: 4,
    [MODELS.BALANCED]: 1,
    [MODELS.LIGHT]: 0.1
  };
  
  const usedCost = (tokens / 1000000) * pricing[usedModel];
  const optimalCost = (tokens / 1000000) * pricing[optimalModel];
  
  return {
    usedCost,
    optimalCost,
    saved: usedCost - optimalCost,
    savedPercentage: ((usedCost - optimalCost) / usedCost * 100).toFixed(1)
  };
}

module.exports = {
  MODELS,
  LIGHT_TASKS,
  BALANCED_TASKS,
  routeModel,
  routeByPromptLength,
  routeByKeywords,
  smartRoute,
  getModelPricing,
  calculateSavings
};