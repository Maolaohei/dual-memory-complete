# Dual-Memory Complete 🧠

> 完整的 AI Agent 记忆系统 - 从基础存储到高级管理

[English](./README.md) | [中文](./README.zh.md)

---

## 🏗️ 系统架构

**Dual-Memory Complete** 整合了两层架构：

### Layer 1: Core v3 (向量记忆核心)
- **LanceDB** - 本地向量数据库
- **Transformers.js** - 本地嵌入模型 (384维)
- **实时写入** - 毫秒级存储延迟 (~50ms)
- **时间轴版本化** - 保留历史轨迹
- **冲突检测** - 自动处理矛盾记忆
- **动态遗忘** - P0/P1/P2 三级置信衰减

### Layer 2: Enhanced v4 (高级管理)
- **智能压缩** - 相似记忆自动总结
- **可视化** - 时间轴、统计面板、网络图
- **主动干预** - 完整 CRUD 控制
- **访问追踪** - 记忆使用统计

---

## 📦 包含内容

```
dual-memory-complete/
├── Core v3/                    # 生产级向量记忆
│   ├── LanceDB 向量存储
│   ├── Transformers.js 嵌入
│   ├── 时间轴版本化
│   ├── 冲突检测
│   └── 动态遗忘机制
│
└── Enhanced v4/                # 高级管理
    ├── 智能压缩
    ├── 可视化 (3种视图)
    └── 主动干预 (CRUD)
```

---

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/Maolaohei/dual-memory-complete.git
cd dual-memory-complete
npm install
```

### 基础使用 (Core v3)

```bash
# 查看状态
node cli.js status

# 添加记忆
node cli.js add "用户喜欢草莓甜甜圈" --type preference --priority P0

# 语义搜索
node cli.js search "甜甜圈"

# 查看时间线
node cli.js timeline
```

### 高级管理 (Enhanced v4)

```bash
cd v4-enhanced

# 智能压缩（预览）
node commands/compress.js --dry-run

# 生成可视化
node commands/visualize.js

# 主动管理
node cli.js stats
node cli.js remember "新记忆" --priority P0
node cli.js forget <记忆ID>
```

---

## 💡 核心特性

| 特性 | Core v3 | Enhanced v4 |
|------|---------|-------------|
| 向量存储 | ✅ LanceDB | ✅ 复用 v3 |
| 嵌入模型 | ✅ Transformers | ✅ 复用 v3 |
| 语义搜索 | ✅ | ✅ |
| 时间轴 | ✅ | ✅ |
| 智能压缩 | ❌ | ✅ |
| 可视化 | ❌ | ✅ 3种视图 |
| 主动管理 | ❌ | ✅ CRUD |

---

## 🎯 适用场景

| 场景 | 推荐版本 |
|------|----------|
| 基础 AI Agent | Core v3 |
| 需要记忆管理 | Core + Enhanced |
| 生产级应用 | 完整系统 |
| 研究实验 | Core v3 |

---

## 🤝 共建邀请

我们正在寻找以下贡献：

- **Core 优化** - LanceDB 性能、嵌入模型
- **可视化** - 更多图表、实时监控
- **多模态** - 图像、音频记忆
- **分布式** - 多设备同步

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 许可证

MIT 许可证 - 详见 [LICENSE](./LICENSE)

---

**"记忆不只是存储，更是理解"** 🧠✨