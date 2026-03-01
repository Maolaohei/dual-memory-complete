# Dual-Memory Complete 🧠

> 完整的 AI Agent 记忆系统 - 从基础存储到智能管理

**Dual-Memory Complete** 是一个生产级的 AI Agent 记忆系统，v6.0 带来革命性升级：

- **🗄️ 多表向量库** - memories/core_files/skills 三表独立
- **📊 置信度可配置** - 优化阈值可调整
- **🔄 触发词自进化** - 批量更新 + 轻量模型
- **⚡ Token 优化 91%** - 44000 → 3906 token
- **💰 费用节省 84%** - 0.10 → 0.016元/次
- **🛡️ 容错稳定** - JSON解析容错 + 数据备份
- **🔒 并发安全** - 多会话独立管理
- **🧹 自动归档** - HISTORY.md 自动清理

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dual-Memory Complete v5.0                   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 6: 任务优化层 🆕                                          │
│  ├── Task Fingerprinter    （任务指纹提取）                       │
│  ├── Experience Store      （经验库，JSON，非向量）               │
│  ├── Step Injector         （分级注入，50~80 token）              │
│  ├── Outcome Tracker       （执行追踪，提炼结论）                 │
│  └── Template Library      （代码模板复用）                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: 会话层 🆕                                              │
│  ├── Session Auto-Init     （新会话自动启动）                     │
│  ├── Model Warmup          （后台预热，消除冷启动）               │
│  └── Token Budget Manager  （上下文预算 2600 token 硬限制）      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: 集成层                                                  │
│  ├── Memory Hook           （自动检索/存储）                      │
│  ├── HyDE Retrieval        （假设文档检索，提升召回）             │
│  └── Conflict Arbiter      （规则 vs 向量冲突仲裁）              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 管理层                                                  │
│  ├── File Watcher          （MD变更自动增量同步）                 │
│  ├── Dedup Engine          （写入去重，相似度 > 0.92 合并）       │
│  ├── Conflict Detector     （记忆冲突检测 + 置信度管理）          │
│  └── Lifecycle Manager     （P2 自动清理）                       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: 核心引擎                                                │
│  ├── LanceDB Vector Store                                        │
│  ├── bge-small-zh-v1.5     （中文嵌入，23MB）                    │
│  ├── Semantic Chunker      （语义感知切片 + 重叠）               │
│  ├── Weighted Scorer       （相似度×0.7 + 新鲜度×0.2 + 优先级×0.1）│
│  └── File Hash Index       （切片一致性追踪）                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: 存储层                                                  │
│  ├── LanceDB               （向量记忆）                          │
│  ├── file_index.json       （文件哈希索引）                      │
│  ├── experiences/          （任务经验库，按类型分文件）           │
│  ├── templates/            （代码模板库）                        │
│  ├── SOUL_CORE.md          （最小人格核心，≤300 token）          │
│  ├── optimizations.json    （结构化规则，替代 MEMORY.md）        │
│  └── HISTORY.md            （只追加，不加载）                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 v6.0 vs v5.0 对比

| 指标 | v5.0 | v6.0 | 提升 |
|------|------|------|------|
| **向量库结构** | 单表 | 三表独立 | ✅ 无污染 |
| **置信度阈值** | 硬编码 | 可配置 | ✅ 可调优 |
| **触发词管理** | 无限累积 | 自动修剪 | ✅ 预算可控 |
| **JSON解析** | 无容错 | 降级默认值 | ✅ 不崩溃 |
| **并发安全** | 无保护 | 会话独立 | ✅ 多用户 |
| **数据备份** | 无 | 自动备份 | ✅ 可恢复 |
| **模型路由** | 单一模型 | 智能路由 | ✅ 节省40倍 |
| **Token优化** | 60% | 91% | ✅ 更高效 |
| **费用节省** | - | 84% | ✅ 0.10→0.016元 |

---

## 📦 核心功能

### 1. 会话自启动 (Session Auto-Init) 🆕
新会话自动初始化，无需手动触发：
```
流程: 加载 SOUL_CORE.md → 后台预热模型 → 启动文件监听
效果: 消除冷启动延迟，用户无感知
```

### 2. 文件变更监听 (File Watcher) 🆕
MD 文件变更自动增量同步向量库：
```
机制: MD5 哈希检测 + 语义感知切片 + 增量更新
效果: 无需手动重建索引，实时同步
```

### 3. 任务优化系统 (Task Optimization) 🆕
任务指纹提取 → 经验检索 → 分级注入 → 执行追踪 → 经验合并：
```
① 跳过死路: 每次失败尝试 ~800 token × 平均试错 2.3 次 = 节省 ~1840 token
② 直接最优路径: 探索 ~1200 token → 复用 ~400 token = 节省 ~800 token
③ 代码模板复用: 重新生成 ~600 token → 引用 ~50 token = 节省 ~550 token
合计: 同类任务每次节省 ~3200 token
```

### 4. Token 预算硬限制 🆕
防止上下文溢出，2600 token 硬限制：
| 预算项 | 限制 | 用途 |
|--------|------|------|
| SOUL_CORE | 300 | 最小人格核心 |
| 记忆检索 | 500 | 召回的记忆 |
| 经验提示 | 80 | 任务优化注入 |
| 对话历史 | 1500 | 近期对话 |
| 系统提示 | 200 | 系统指令 |

### 5. HyDE 检索优化
生成假设记忆文档，提升语义召回率：
```
查询: "用户偏好"
HyDE: "用户喜欢用户..." 
结果: 召回相关记忆，即使没有精确匹配
```

### 6. 时间衰减评分
综合评分公式：`相似度×0.7 + 新鲜度×0.2 + 频率×0.1`
- 最近记忆优先展示
- 高频访问记忆加成
- 优先级加成: P0×1.2, P1×1.0, P2×0.8, P3×0.6

### 7. 核心文件向量化
将核心配置文件切片索引，按需检索：
- `SOUL.md` → 8 切片 (角色定义)
- `USER.md` → 2 切片 (用户档案)
- `AGENTS.md` → 5 切片 (Agent 指令)

### 8. P2 记忆生命周期
自动管理记忆生命周期：
```
P2 记忆: 30天降级 → 60天归档 → 90天删除
P3 记忆: 14天归档 → 30天删除
相似合并: 相似度 > 0.92 自动合并
```

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

### v5.0 初始化

```bash
# 初始化 v5.0 系统
node init-v5.js

# 输出示例:
# ✅ Session Auto-Init: 已就绪
# ✅ File Watcher: 已启动
# ✅ Task Optimizer: 已加载
# ✅ Token Budget: 2600 token 硬限制
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

### 任务优化效果
```
首次执行: 探索 + 试错 = ~2400 token
二次执行: 经验注入 + 直接路径 = ~400 token
节省: ~2000 token (83%)
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
├── init-v5.js                # v5.0 初始化脚本 🆕
├── config/
│   └── default.json          # 配置文件
├── src/
│   ├── session.js            # 会话自启动 🆕
│   ├── file-watcher.js       # 文件变更监听 🆕
│   ├── memory-store-v3.js    # 主存储 (v3 + HyDE + 时间衰减)
│   ├── memory-lifecycle.js   # 生命周期管理
│   ├── token-budget.js       # Token 预算管理 v5.0 🆕
│   ├── retrieval-feedback.js # 检索反馈回路
│   ├── experiences/          # 任务优化模块 🆕
│   │   ├── fingerprint.js    # 任务指纹提取
│   │   ├── store.js          # 经验存储
│   │   ├── injector.js       # 分级注入
│   │   └── tracker.js        # 执行追踪
│   ├── timeline.js           # 时间线追踪
│   ├── archive-store.js      # 归档存储
│   └── ...                   # 其他模块
├── data/
│   ├── vectordb/             # LanceDB 向量库
│   └── file_index.json       # 文件哈希索引 🆕
├── experiences/              # 经验库目录 🆕
│   ├── index.json            # 经验索引
│   ├── data_extraction.json  # 数据抓取类经验
│   ├── file_operations.json  # 文件操作类经验
│   ├── code_generation.json  # 代码生成类经验
│   └── system_tasks.json     # 系统任务类经验
├── memory/
│   ├── SOUL_CORE.md          # 最小人格核心 🆕
│   ├── SOUL.md               # 完整人格
│   ├── USER.md               # 用户档案
│   ├── AGENTS.md             # Agent 指令
│   ├── optimizations.json    # 结构化规则 🆕
│   └── HISTORY.md            # 事件日志
├── migrate-to-bge.js         # 模型迁移脚本
├── index-core-files.js       # 核心文件向量化
├── evaluate-v4.js            # 功能评估测试
└── BENCHMARK.md              # 升级对比报告
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
| 中文 AI Agent | v5.0 (bge-small-zh) |
| 轻量部署 | v5.0 (23MB 模型) |
| 高频检索 | v5.0 + HyDE |
| 长期运行 | v5.0 + 生命周期管理 |
| 任务重复性高 | v5.0 + 任务优化系统 🆕 |

---

## 📝 更新日志

### 2026-03-02: v6.0 多表向量库 🎉
- ✅ **向量库分表** - memories/core_files/skills 三表独立
- ✅ **置信度可配置** - optimizations.json 可调整阈值
- ✅ **触发词自进化** - 批量更新 + GLM-4-Flash 轻量模型
- ✅ **SkillContext** - TTL生命周期 + 话题切换检测
- ✅ **SessionManager** - 多会话并发保护
- ✅ **SafeParse** - LLM JSON解析容错
- ✅ **TokenCounter** - Token计数实现
- ✅ **ModelRouter** - 智能模型路由 (节省40倍)
- ✅ **TriggerPruner** - 触发词自动修剪
- ✅ **BackupManager** - 数据自动备份
- ✅ **HistoryArchiver** - HISTORY.md自动归档
- ✅ **ContextCompactor** - 上下文压缩器
- ✅ **SkillInstaller** - Skill安装自动注册
- ✅ **TaskTracker** - 任务执行追踪
- ✅ **ExperienceInjector** - 经验分级注入

### 2026-03-01: v5.0 完整升级
- ✅ **会话自启动** - 新会话自动初始化，后台预热模型
- ✅ **文件变更监听** - MD 文件变更自动增量同步向量库
- ✅ **任务优化系统** - 任务指纹提取、经验检索、分级注入、执行追踪
- ✅ **Token 预算硬限制** - 2600 token 硬限制，支持经验提示预算
- ✅ **SOUL_CORE.md** - 最小人格核心，≤300 token
- ✅ **optimizations.json** - 结构化规则，替代 MEMORY.md
- ✅ **file_index.json** - 文件哈希索引，追踪切片一致性

### 2026-02-28: v4.0 完整升级
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
- **语义感知切片器** - 更智能的文本分片

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

**"记忆不只是存储，更是理解"** 🧠✨
