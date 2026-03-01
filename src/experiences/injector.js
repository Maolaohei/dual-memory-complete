/**
 * ExperienceInjector - 经验分级注入
 * 
 * 功能：
 * 1. 根据置信度生成分级提示
 * 2. 控制提示长度（50~80 token）
 * 3. 提供最优路径和死路警告
 */

/**
 * 构建经验提示
 * @param {Object} experience - 经验对象
 * @param {number} confidence - 置信度 (0~1)
 * @returns {string} 提示文本
 */
function buildHint(experience, confidence) {
  if (!experience) return '';
  
  // 根据置信度选择提示级别
  if (confidence >= 0.9) {
    return buildHighConfidenceHint(experience);
  } else if (confidence >= 0.7) {
    return buildMediumConfidenceHint(experience);
  } else {
    return buildLowConfidenceHint(experience);
  }
}

/**
 * 高置信度提示（直接给出最优路径）
 */
function buildHighConfidenceHint(experience) {
  const steps = experience.optimal_steps || [];
  const deadEnds = experience.dead_ends || [];
  
  let hint = '💡 推荐路径：';
  
  if (steps.length > 0) {
    // 只取前3个步骤
    const topSteps = steps.slice(0, 3);
    hint += topSteps.map((s, i) => `${i + 1}. ${s.description}`).join(' → ');
  }
  
  // 添加死路警告
  if (deadEnds.length > 0) {
    const topDeadEnds = deadEnds.slice(0, 2);
    hint += ' | ⚠️ 避免：' + topDeadEnds.map(d => d.description).join('、');
  }
  
  return hint;
}

/**
 * 中置信度提示（建议路径）
 */
function buildMediumConfidenceHint(experience) {
  const steps = experience.optimal_steps || [];
  const deadEnds = experience.dead_ends || [];
  
  let hint = '💭 建议尝试：';
  
  if (steps.length > 0) {
    hint += steps[0]?.description || '无';
  }
  
  if (deadEnds.length > 0) {
    hint += '（注意：' + deadEnds[0]?.reason + '）';
  }
  
  return hint;
}

/**
 * 低置信度提示（仅提示有相关经验）
 */
function buildLowConfidenceHint(experience) {
  return `📌 有相关经验可参考（置信度较低）`;
}

/**
 * 计算有效置信度
 * @param {Object} experience - 经验对象
 * @param {number} similarity - 指纹相似度
 * @returns {number} 有效置信度
 */
function effectiveConfidence(experience, similarity) {
  if (!experience) return 0;
  
  // 基础置信度 = 指纹相似度
  let confidence = similarity || 0.5;
  
  // 成功率加成
  const successRate = experience.stats?.success_rate || 0.5;
  confidence *= (0.5 + successRate * 0.5);
  
  // 执行次数加成（越多越可信）
  const executions = experience.stats?.total_executions || 1;
  confidence *= Math.min(1, Math.log(executions + 1) / 3);
  
  // 时间衰减（越久越不可信）
  const lastUsed = new Date(experience.stats?.last_used || experience.updated_at);
  const daysSince = (Date.now() - lastUsed) / (1000 * 60 * 60 * 24);
  confidence *= Math.exp(-daysSince / 90); // 90天衰减一半
  
  return Math.min(1, confidence);
}

/**
 * 生成完整的经验上下文
 * @param {Object} experience - 经验对象
 * @param {number} confidence - 置信度
 * @param {number} maxTokens - 最大 token 数
 * @returns {string} 完整上下文
 */
function buildFullContext(experience, confidence, maxTokens = 80) {
  if (!experience) return '';
  
  const hint = buildHint(experience, confidence);
  
  // 估算 token 数
  const estimatedTokens = estimateTokens(hint);
  
  if (estimatedTokens <= maxTokens) {
    return hint;
  }
  
  // 截断
  return hint.slice(0, maxTokens * 2) + '...';
}

/**
 * 估算 token 数
 */
function estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

module.exports = {
  buildHint,
  effectiveConfidence,
  buildFullContext
};
