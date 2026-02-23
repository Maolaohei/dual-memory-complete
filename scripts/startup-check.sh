#!/bin/bash
# ============================================
# 记忆系统启动自检脚本
# 新会话时快速检查记忆系统状态
# ============================================

WORKSPACE_DIR="/root/.openclaw/workspace"
DUAL_MEMORY_DIR="$WORKSPACE_DIR/skills/dual-memory"

echo "🧠 记忆系统启动自检"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查目录
if [ ! -d "$DUAL_MEMORY_DIR" ]; then
    echo "❌ 记忆系统目录不存在: $DUAL_MEMORY_DIR"
    exit 1
fi

echo "✅ 记忆系统目录存在"

# 检查核心文件
CORE_FILES=(
    "src/memory-store.js"
    "src/enhanced-store.js"
    "src/archive-store.js"
    "src/timeline.js"
    "tools/memory-tools.js"
    "cli.js"
)

MISSING=0
for file in "${CORE_FILES[@]}"; do
    if [ ! -f "$DUAL_MEMORY_DIR/$file" ]; then
        echo "❌ 缺少文件: $file"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -eq 0 ]; then
    echo "✅ 所有核心文件存在"
else
    echo "⚠️  缺少 $MISSING 个文件"
fi

# 检查数据库目录
if [ -d "$DUAL_MEMORY_DIR/lancedb" ]; then
    echo "✅ LanceDB 数据库目录存在"
else
    echo "⚠️  LanceDB 数据库目录不存在，可能需要初始化"
fi

# 检查归档目录
if [ -d "$WORKSPACE_DIR/memory/archive/v3" ]; then
    echo "✅ 归档存储目录存在"
else
    echo "ℹ️  归档存储目录尚未创建 (将在首次归档时自动创建)"
fi

# 尝试获取状态 (如果Node.js可用)
if command -v node &> /dev/null; then
    echo ""
    echo "📊 尝试获取记忆系统状态..."
    cd "$DUAL_MEMORY_DIR"
    
    # 使用node检查 (带超时)
    timeout 10 node -e "
        const fs = require('fs');
        const path = require('path');
        
        try {
            // 检查配置文件
            const configPath = path.join('$DUAL_MEMORY_DIR', 'config/default.json');
            if (fs.existsSync(configPath)) {
                console.log('✅ 配置文件存在');
            }
            
            // 检查package.json
            const pkgPath = path.join('$DUAL_MEMORY_DIR', 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                console.log('✅ package.json 存在 (版本: ' + (pkg.version || '未知') + ')');
            }
            
            console.log('✅ Node.js 环境正常');
        } catch (e) {
            console.log('⚠️  检查失败: ' + e.message);
        }
    " 2>/dev/null || echo "⚠️  Node.js 检查超时或失败"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 记忆系统 v3.0 配置"
echo ""
echo "四级分级阈值:"
echo "  P0 (≥0.7): 永久保存"
echo "  P1 (≥0.65): 长期保存"
echo "  P2 (≥0.5): 短期保存 (30天)"
echo "  Skip (<0.4): 直接跳过"
echo ""
echo "三级存储架构:"
echo "  Active: 正常查询和更新"
echo "  Archive: 压缩存储 (20%摘要)"
echo "  DeepFreeze: 仅保留索引"
echo ""
echo "动态评分维度:"
echo "  + 引用频率 (log增长)"
echo "  - 时间衰减 (0.05/月)"
echo "  + 用户确认 (+0.20)"
echo "  + 冲突解决 (+0.10)"
echo "  + 多源验证 (+0.15)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 记忆系统自检完成"
echo ""
echo "快速命令:"
echo "  cd skills/dual-memory && node cli.js status"
echo "  cd skills/dual-memory && node test/test-phase3-integration.js"
echo ""
