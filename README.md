# Dual-Memory Complete 🧠

> 完整的 AI Agent 记忆系统 - 从基础存储到智能管理

**Dual-Memory Complete** 是一个生产级的 AI Agent 记忆系统，v4.0 带来革命性升级：

- **🚀 95% 模型瘦身** - 420MB → 23MB
- **⚡ 2x 检索加速** - 200-400ms → 128ms
- **🇨🇳 中文原生支持** - bge-small-zh 向量模型
- **🧠 HyDE 智能检索** - 语义召回率大幅提升
- **⏰ 时间衰减评分** - 新鲜记忆优先展示
- **💾 Token 预算管理** - 防止上下文溢出

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Dual-Memory Complete v4.0                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Intelligence 🆕                                   │
│  ├── HyDE Retrieval (假设文档增强检索)                       │
│  ├── Time Decay Scoring (时间衰减评分)                       │
│  ├── Token Budget Manager (Token 预算管理)                  │
│  └── Retrieval Feedback Loop (检索反馈回路)                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Lifecycle 🆕                                      │
│  ├── P2 Memory Lifecycle (30天降级→60天归档→90天删除)        │
│  ├── Auto Merge (相似度>0.92自动合并)                       │
│  └── Core File Indexing (核心文件向量化)                    │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Integration                                       │
│  ├── Memory Hook (自动检索/存储)                             │
│  ├── Context Compression (上下文压缩)                        │
│  └── OpenClaw Bridge (无缝集成)                             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Core Engine (v4)                                  │
│  ├── LanceDB Vector Store (512维)                           │
│  ├── bge-small-zh Embeddings (23MB, 中文原生)               │
│  ├── Timeline Versioning                                    │
│  └── Conflict Detection                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Storage                                           │
│  ├── VectorDB (LanceDB)                                     │
│  ├── Markdown Archive                                       │
│  └── Session State                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 v4.0 性能对比

| 指标 | v3.0 (mpnet) | v4.0 (bge-small-zh) | 提升 |
|------|--------------|---------------------|------|
| **模型大小** | 420MB | 23MB | **节省 95%** |
| **向量维度** | 768 | 512 | **减少 33%** |
| **模型加载** | ~4s | <1s | **快 4x** |
| **检索延迟** | 200-400ms | 128ms (平均) | **快 2x** |
| **中文检索** | ⚠️ 泛化 | ✅ 原生支持 | **显著提升** |
| **Token 占用** | 43KB | 15KB | **节省 66%** |

---

## 📦 核心功能

### 1. HyDE 检索优化 🆕
生成假设记忆文档，提升语义召回率：
```
查询: "用户偏好"
HyDE: "用户喜欢用户..." 
结果: 召回相关记忆，即使没有精确匹配
```

### 2. 时间衰减评分 🆕
综合评分公式：`相似度×0.7 + 新鲜度×0.2 + 频率×0.1`
- 最近记忆优先展示
- 高频访问记忆加成
- 优先级加成: P0×1.2, P1×1.0, P2×0.8, P3×0.6

### 3. 核心文件向量化 🆕
将核心配置文件切片索引，按需检索：
- `SOUL.md` → 8 切片 (角色定义)
- `USER.md` → 2 切片 (用户档案)
- `AGENTS.md` → 5 切片 (Agent 指令)

### 4. Token 预算管理 🆕
防止上下文溢出：
| 预算项 | 限制 | 用途 |
|--------|------|------|
| 核心文件 | 800 | 角色定义等 |
| 检索记忆 | 600 | 召回的记忆 |
| 对话历史 | 1500 | 近期对话 |
| 系统提示 | 300 | 系统指令 |
| 预留缓冲 | 200 | 紧急情况 |

### 5. P2 记忆生命周期 🆕
自动管理记忆生命周期：
```
P2 记忆: 30天降级 → 60天归档 → 90天删除
P3 记忆: 14天归档 → 30天删除
相似合并: 相似度 > 0.92 自动合并
```

### 6. 检索反馈回路 🆕
持续优化检索效果：
- 记录每次检索事件
- 统计记忆命中次数
- 分析热门查询
- 生成优化建议

---

## 🔧 嵌入模型配置

当前使用模型：`bge-small-zh-v1.5` (512维, 23MB)

| 模型 | 维度 | 大小 | 中文支持 | 特点 |
|------|------|------|----------|------|
| **bge-small-zh (当前)** | **512** | **23MB** | **✅ 原生** | **轻量高效** |
| mpnet (旧版) | 768 | 420MB | ⚠️ 泛化 | 平衡性能 |
| minilm (旧版) | 384 | 120MB | ⚠️ 泛化 | 轻量快速 |

切换模型只需修改 `config/default.json`：
```json
{
  "embedding": {
    "current": "bge-small-zh",
    "models": {
      "bge-small-zh": { 
        "name": "Xenova/bge-small-zh-v1.5", 
        "dimensions": 512 
      }
    }
  }
}
```

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/Maolaohei/dual-memory-complete.git
cd dual-memory-complete
npm install
```

### 基础使用

```bash
# 查看系统状态
node cli.js status

# 添加记忆
node cli.js add "用户喜欢草莓甜甜圈" --type preference --priority P0

# 语义搜索 (支持 HyDE)
node cli.js search "甜甜圈"

# 查看检索反馈
node cli.js feedback

# 运行生命周期管理
node cli.js lifecycle
```

### 从旧版迁移

如果你使用的是 v3.0 (mpnet)，可以使用迁移工具：

```bash
# 迁移向量模型
node migrate-to-bge.js

# 索引核心文件
node index-core-files.js

# 评估升级效果
node evaluate-v4.js
```

### Memory Hook 集成

一行代码集成到 OpenClaw：

```javascript
const { withMemory } = require('./src/memory-hook-simple');

const response = await withMemory(userMessage, async (messages) => {
  return await openclaw.generate(messages);
});
```

---

## 🧪 评估测试

### 检索性能
```
"甜甜圈"   → 3条, 177ms, HyDE=true
"用户偏好" → 3条, 81ms,  HyDE=true
"Pixiv"    → 3条, 123ms, HyDE=true
"项目配置" → 3条, 117ms, HyDE=true
"角色定义" → 3条, 140ms, HyDE=true

平均延迟: 128ms ✅
```

### 系统统计
```
总记忆数: 94 条
按类型:
  - migrated: 78
  - core_soul: 8
  - core_user: 2
  - core_agents: 5
  - system: 1

按优先级:
  - P0: 22 (核心偏好)
  - P1: 12 (重要记录)
  - P2: 59 (一般记录)
  - P3: 1 (降级记录)
```

---

## 📁 项目结构

```
dual-memory-complete/
├── cli.js                    # 命令行工具
├── config/
│   └── default.json          # 配置文件
├── src/
│   ├── memory-store.js       # 主存储 (v2)
│   ├── memory-store-v3.js    # 主存储 (v3 + HyDE + 时间衰减)
│   ├── memory-lifecycle.js   # 生命周期管理 🆕
│   ├── token-budget.js       # Token 预算管理 🆕
│   ├── retrieval-feedback.js # 检索反馈回路 🆕
│   ├── timeline.js           # 时间线追踪
│   ├── archive-store.js      # 归档存储
│   └── ...                   # 其他模块
├── memory/
│   └── optimizations.json    # 优化规则结构化 🆕
├── migrate-to-bge.js         # 模型迁移脚本 🆕
├── index-core-files.js       # 核心文件向量化 🆕
├── evaluate-v4.js            # 功能评估测试 🆕
└── BENCHMARK.md              # 升级对比报告 🆕
```

---

## 📚 文档

- [BENCHMARK.md](./BENCHMARK.md) - v4.0 升级对比报告
- [Core v3 文档](./docs/README-v3.md) - 向量记忆系统
- [架构设计](./docs/ARCHITECTURE.md) - 系统设计原理
- [API 参考](./docs/API.md) - 完整 API 文档

---

## 🎯 适用场景

| 场景 | 推荐配置 |
|------|----------|
| 中文 AI Agent | v4.0 (bge-small-zh) |
| 轻量部署 | v4.0 (23MB 模型) |
| 高频检索 | v4.0 + HyDE |
| 长期运行 | v4.0 + 生命周期管理 |

---

## 📝 更新日志

### 2026-02-28: v4.0 完整升级 🎉
- ✅ **模型迁移** - mpnet → bge-small-zh (95% 瘦身)
- ✅ **HyDE 检索** - 假设文档增强检索
- ✅ **时间衰减** - 综合评分算法
- ✅ **核心文件向量化** - 15 个切片按需检索
- ✅ **Token 预算** - 防止上下文溢出
- ✅ **生命周期管理** - P2 记忆自动降级归档
- ✅ **检索反馈** - 持续优化检索效果

### 2026-02-28: 迁移工具
- ✅ `migrate-v4.js` - 批量迁移 MD 文件
- ✅ Schema 修复 - 新增 10 个字段
- ✅ CLI 增强 - 更好的错误处理

### 2026-02-24: Memory Hook
- ✅ 自动检索 + 上下文压缩
- ✅ OpenClaw 集成方案

---

## 🤝 共建

我们正在寻找以下贡献：

- **多模态支持** - 图像、音频记忆
- **分布式扩展** - 多设备同步
- **可视化增强** - 实时监控面板

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

**"记忆不只是存储，更是理解"** 🧠✨
