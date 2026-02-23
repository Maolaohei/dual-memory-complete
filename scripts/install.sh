#!/bin/bash
# Dual-Memory Skill 安装脚本 - Node.js 版本
# 纯 Node.js 实现，无需 Python

set -e

echo "🧠 安装双系统记忆架构 (Node.js 版本)..."
echo ""

# 检查 Node.js 版本
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 需要 Node.js 18+，当前版本: $(node --version 2>/dev/null || echo '未安装')"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 进入 skill 目录
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SKILL_DIR"

# 安装依赖
echo "📦 安装 npm 依赖..."
npm install

# 确保 LanceDB 目录存在
mkdir -p lancedb

# 创建访问日志
touch ../../memory/.access_log.jsonl

echo ""
echo "✅ 安装完成!"
echo ""
echo "使用方法:"
echo "  cd $SKILL_DIR"
echo "  npm run status          # 查看状态"
echo "  npm run cli -- search   # 搜索记忆"
echo "  npm run cli -- add      # 添加记忆"
echo "  npm run archive:dry     # 试运行归档"
echo "  npm run archive         # 执行归档"
echo ""
echo "配置位置:"
echo "  config/default.json"
echo ""
