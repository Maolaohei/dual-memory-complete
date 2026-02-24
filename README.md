# Dual-Memory Complete 🧠

> 完整的 AI Agent 记忆系统 - 从基础存储到高级管理

**Dual-Memory Complete** 是一个生产级的 AI Agent 记忆系统，整合了：
- **v3 Core** - 向量语义记忆 (LanceDB + Transformers)
- **v4 Enhanced** - 智能压缩、可视化、主动干预

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Dual-Memory Complete                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Management (v4)                                   │
│  ├── Smart Compression (compress.js)                        │
│  ├── Visualization (timeline, stats, network)               │
│  └── Active Intervention (CRUD CLI)                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Core Engine (v3)                                  │
│  ├── LanceDB Vector Store (768维)                           │
│  ├── Transformers.js Embeddings (mpnet-base-v2)             │
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

## 📦 包含组件

### Core v3 (生产级向量记忆)
- ✅ **LanceDB** - 本地向量数据库 (768维)
- ✅ **Transformers.js** - 本地嵌入模型 (all-mpnet-base-v2, 768维)
- ✅ **多模型支持** - minilm / mpnet / qwen3 (预留) 可切换
- ✅ **实时写入** - 毫秒级存储延迟
- ✅ **时间轴版本化** - 保留历史轨迹
- ✅ **冲突检测** - 自动处理矛盾记忆
- ✅ **置信衰减** - P0/P1/P2 三级衰减

### Enhanced v4 (高级管理)
- ✅ **智能压缩** - 相似记忆自动总结
- ✅ **可视化** - 时间轴/统计/网络图
- ✅ **主动干预** - 完整 CRUD 控制
- ✅ **访问追踪** - 记忆使用统计

---

## 🔧 嵌入模型配置

当前使用模型：`all-mpnet-base-v2` (768维)

| 模型 | 维度 | MTEB 得分 | 大小 | 特点 |
|------|------|-----------|------|------|
| minilm (旧版) | 384 | 56.8 | 120MB | 轻量快速 |
| **mpnet (当前)** | **768** | **62.3** | 420MB | **平衡性能** |
| qwen3 (预留) | 768 | ~66 | 600MB | 中文特化 |

切换模型只需修改 `config/default.json`：
```json
{
  "embedding": {
    "current": "mpnet",
    "models": {
      "mpnet": { "name": "Xenova/all-mpnet-base-v2", "dimensions": 768 }
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

### 基础使用 (v3 Core)

```bash
# 查看系统状态
node cli.js status

# 添加记忆
node cli.js add "用户喜欢草莓甜甜圈" --type preference --priority P0

# 语义搜索
node cli.js search "甜甜圈"

# 时间线查看
node cli.js timeline
```

### 高级管理 (v4 Enhanced)

```bash
cd v4-enhanced

# 智能压缩
node commands/compress.js --dry-run

# 生成可视化
node commands/visualize.js

# 主动管理
node cli.js remember "新记忆" --priority P0 --tags food
node cli.js forget <id>
node cli.js stats
```

---

## 📚 文档

- [Core v3 文档](./docs/README-v3.md) - 向量记忆系统
- [Enhanced v4 文档](./v4-enhanced/README.md) - 高级管理功能
- [架构设计](./docs/ARCHITECTURE.md) - 系统设计原理
- [API 参考](./docs/API.md) - 完整 API 文档
- [Jina AI 指南](./docs/jina-ai-guide.md) - 内容抓取指南

---

## 🎯 适用场景

| 场景 | 推荐功能 |
|------|----------|
| 基础 AI Agent | v3 Core 即可 |
| 需要记忆管理 | v3 + v4 CLI |
| 生产级应用 | 完整系统 |
| 研究/实验 | v3 Core |

---

## 🤝 共建

我们正在寻找以下贡献：

- **Core 优化** - LanceDB 性能、嵌入模型
- **可视化增强** - 更多图表类型、实时监控
- **多模态支持** - 图像、音频记忆
- **分布式扩展** - 多设备同步

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

**"记忆不只是存储，更是理解"** 🧠✨

---

## 📝 更新日志

### 2026-02-24
- ✅ 嵌入模型升级为 `all-mpnet-base-v2` (768维)
- ✅ 支持多模型配置切换 (minilm/mpnet/qwen3)
- ✅ 性能提升 10% (MTEB 56.8 → 62.3)
- ✅ 新增 Jina AI 内容抓取指南
