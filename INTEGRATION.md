# OpenClaw + Dual-Memory 集成指南

> 让 dual-memory 成为 OpenClaw 的"本能"

## 🚀 快速开始

### 方式 1：使用启动脚本（推荐）

```bash
# 启动带记忆增强的 OpenClaw
~/.openclaw/bin/start-with-memory.sh

# 或者添加 alias 到 ~/.bashrc
echo 'alias openclaw-mem="~/.openclaw/bin/start-with-memory.sh"' >> ~/.bashrc
source ~/.bashrc

# 之后使用
openclaw-mem
```

### 方式 2：通过 Node.js 直接调用

```javascript
const { withMemory } = require('./skills/dual-memory/src/memory-hook-simple.js');

// 在 OpenClaw 的处理流程中
const response = await withMemory(userMessage, async (messages) => {
  return await openclaw.generate(messages);
});
```

### 方式 3：Memory Bridge（高级）

```bash
# 处理消息前调用 Memory Bridge
node skills/dual-memory/memory-bridge.js process << 'EOF'
{
  "message": "用户问题",
  "context": { "systemPrompt": "..." }
}
EOF

# 存储对话结果
node skills/dual-memory/memory-bridge.js store << 'EOF'
{
  "user": "用户问题",
  "assistant": "助手回复",
  "metadata": { "topic": "investment" }
}
EOF
```

## 🧠 集成功能

启用后，OpenClaw 会自动：

1. **检索相关记忆** — 每次收到消息前，自动检索 dual-memory 中的相关内容
2. **压缩短期上下文** — 智能压缩最近 10 轮对话，避免上下文溢出
3. **自动存储** — 对话结束后，自动提取有价值信息存入 dual-memory
4. **跨会话记忆** — 3 天前提的事情，今天仍能记得

## 📊 验证集成

```bash
# 测试 Memory Hook
cd ~/.openclaw/workspace/skills/dual-memory
node memory-bridge.js test

# 查看记忆统计
node cli.js status

# 测试搜索
node cli.js search "黄金基金"
```

## ⚙️ 配置选项

编辑 `~/.openclaw/bin/start-with-memory.sh`：

```bash
# 检索设置
export MEMORY_RETRIEVE_LIMIT=5      # 检索记忆数量
export MEMORY_MIN_CONFIDENCE=0.6    # 最小置信度

# 压缩设置
export MEMORY_SHORT_TERM_ROUNDS=10  # 保留对话轮数
export MEMORY_MAX_TOKENS=4000       # 最大 Token 数

# 自动存储
export MEMORY_AUTO_STORE=true       # 是否自动存储
export MEMORY_MIN_EXTRACT_SCORE=6.0 # 最小提取分数
```

## 🔄 工作原理

```
用户消息
    ↓
[Memory Hook] 检索 dual-memory (长期记忆)
    ↓
[Memory Hook] 压缩近期对话 (短期上下文)
    ↓
[Memory Hook] 组装增强上下文
    ↓
[OpenClaw] 生成回复
    ↓
[Memory Hook] 自动存储高价值信息
    ↓
返回给用户
```

## 📝 使用示例

### 场景 1：跨会话记忆

```
Session 1 (3天前):
User: "我想买黄金基金"
→ 自动存入 dual-memory: [用户意向] 黄金投资

Session 2 (今天):
User: "我上次说的投资怎样了？"
→ 检索到黄金基金记忆
→ 回复: "汝上次说的黄金基金，目前金价 $5,234，建议观望"
```

### 场景 2：技术配置记忆

```
Round 1:
User: "怎么配置 Telegram Bot？"
→ 回复并存储配置方法

Round 10 (10轮对话后):
User: "对了，Token 存在哪里？"
→ 检索到之前的配置信息
→ 回复: "Token 在 ~/.openclaw/config/tokens.json"
```

## 🔧 故障排除

### 问题：Memory Hook 未加载

```bash
# 检查 dual-memory 路径
cd ~/.openclaw/workspace/skills/dual-memory
node cli.js status

# 重新初始化
rm -rf lancedb
node cli.js status
```

### 问题：检索不到记忆

```bash
# 检查向量库
node cli.js list 20

# 测试搜索
node cli.js search "测试关键词"

# 检查维度
node -e "const lancedb = require('vectordb'); lancedb.connect('./lancedb').then(db => db.openTable('memories')).then(t => t.schema).then(s => console.log(s))"
```

### 问题：自动存储失败

检查 `memory-hook-simple.js` 中的自动存储逻辑，确保：
- 消息长度 > 20 字符
- 不是以"谢谢"或"拜拜"开头

## 🎯 性能优化

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 有效记忆时长 | 1 会话 | 永久 |
| 跨会话关联 | ❌ | ✅ |
| Token 利用率 | ~30% | ~70% |
| 检索延迟 | N/A | ~100ms |

## 🆚 对比原生 memory-lancedb

| 特性 | OpenClaw 原生 | Dual-Memory + Hook |
|------|--------------|-------------------|
| 嵌入模型 | text-embedding-3 | mpnet-base-v2 (768d) |
| 本地运行 | ✅ | ✅ |
| 无需 API Key | ❌ | ✅ |
| 自动提取 | ✅ | ✅ |
| 上下文压缩 | ❌ | ✅ |
| 时间轴版本 | ❌ | ✅ |
| 冲突检测 | ❌ | ✅ |

## 📝 更新日志

### 2026-02-24
- ✅ Memory Hook 简化版实现
- ✅ 集成启动脚本
- ✅ Memory Bridge 命令行工具
- ✅ 自动记忆存储与检索

## 🤝 贡献

如有问题或建议，欢迎提交 Issue 或 PR：
https://github.com/Maolaohei/dual-memory-complete

---

**"记忆不只是存储，更是理解"** 🧠✨
