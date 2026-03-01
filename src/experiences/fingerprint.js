/**
 * TaskFingerprinter - 任务指纹提取
 * 
 * 功能：
 * 1. 从用户消息中提取任务指纹
 * 2. 分类任务类型
 * 3. 提取关键参数
 */

/**
 * 任务类型模式匹配
 */
const TASK_PATTERNS = {
  data_extraction: [
    /搜索|查找|找|获取|抓取|爬取|下载/,
    /数据|信息|内容|文章|帖子/
  ],
  file_operations: [
    /读取|写入|编辑|修改|删除|创建|移动|复制/,
    /文件|目录|文件夹/
  ],
  code_generation: [
    /写|生成|创建|实现|编写/,
    /代码|脚本|程序|函数|模块/
  ],
  system_tasks: [
    /运行|执行|启动|停止|重启|配置|设置/,
    /命令|服务|进程|系统/
  ],
  image_tasks: [
    /图片|图像|照片|截图|插画|美图/,
    /搜索|下载|生成|处理|识别/
  ],
  video_tasks: [
    /视频|影片|动画|番剧/,
    /下载|搜索|转换|处理/
  ]
};

/**
 * 关键参数提取模式
 */
const PARAM_PATTERNS = {
  platform: /(?:从|在|用)\s*([^\s，。]+?)(?:上|中|里)?(?:搜索|下载|查找)/,
  format: /(?:格式|类型|格式为)\s*[：:]?\s*([^\s，。]+)/,
  count: /(\d+)\s*(?:个|条|张|部|篇)/,
  quality: /(?:高清|高质量|原画|4K|1080P|720P)/
};

/**
 * 提取任务指纹
 * @param {string} message - 用户消息
 * @returns {Object} 任务指纹
 */
function extractFingerprint(message) {
  // 1. 分类任务类型
  const type = classifyTask(message);
  
  // 2. 提取关键参数
  const params = extractParams(message);
  
  // 3. 生成指纹ID
  const fingerprintId = generateFingerprintId(type, params);
  
  // 4. 提取关键词
  const keywords = extractKeywords(message);
  
  return {
    id: fingerprintId,
    type,
    params,
    keywords,
    original: message.slice(0, 100) // 保留原始消息前100字符
  };
}

/**
 * 分类任务类型
 */
function classifyTask(message) {
  const scores = {};
  
  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    scores[type] = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        scores[type] += 1;
      }
    }
  }
  
  // 找出得分最高的类型
  let maxScore = 0;
  let maxType = 'general';
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type;
    }
  }
  
  return maxType;
}

/**
 * 提取关键参数
 */
function extractParams(message) {
  const params = {};
  
  for (const [key, pattern] of Object.entries(PARAM_PATTERNS)) {
    const match = message.match(pattern);
    if (match) {
      params[key] = match[1] || true;
    }
  }
  
  return params;
}

/**
 * 生成指纹ID
 */
function generateFingerprintId(type, params) {
  const parts = [type];
  
  // 添加关键参数
  if (params.platform) parts.push(params.platform);
  if (params.format) parts.push(params.format);
  
  // 生成简短哈希
  const str = parts.join('_');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `fp_${type}_${Math.abs(hash).toString(16).slice(0, 6)}`;
}

/**
 * 提取关键词
 */
function extractKeywords(message) {
  // 简单的关键词提取：移除停用词，保留实词
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    '自己', '这', '那', '她', '他', '它', '们', '这个', '那个', '什么', '怎么'
  ]);
  
  // 分词（简单实现：按空格和标点分割）
  const words = message
    .replace(/[，。！？、；：""''（）【】《》]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));
  
  // 返回前5个关键词
  return [...new Set(words)].slice(0, 5);
}

/**
 * 计算两个指纹的相似度
 */
function fingerprintSimilarity(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  
  let score = 0;
  
  // 类型匹配
  if (fp1.type === fp2.type) score += 0.4;
  
  // 参数匹配
  const params1 = Object.keys(fp1.params || {});
  const params2 = Object.keys(fp2.params || {});
  const paramMatch = params1.filter(p => params2.includes(p)).length;
  const paramTotal = Math.max(params1.length, params2.length, 1);
  score += (paramMatch / paramTotal) * 0.3;
  
  // 关键词匹配
  const keywords1 = new Set(fp1.keywords || []);
  const keywords2 = new Set(fp2.keywords || []);
  const keywordMatch = [...keywords1].filter(k => keywords2.has(k)).length;
  const keywordTotal = Math.max(keywords1.size, keywords2.size, 1);
  score += (keywordMatch / keywordTotal) * 0.3;
  
  return score;
}

module.exports = {
  extractFingerprint,
  classifyTask,
  extractParams,
  extractKeywords,
  fingerprintSimilarity,
  TASK_PATTERNS
};
