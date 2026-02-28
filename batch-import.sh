#!/bin/bash
# NanoBot 记忆批量导入脚本
# 使用 dual-memory CLI 逐个导入 MD 文件

MEMORY_ROOT="/root/.nanobot/workspace/memory"
CLI="/root/.nanobot/workspace/dual-memory-complete/cli.js"

echo "🦇 NanoBot 记忆批量导入开始"
echo ""

# 计数器
total=0
success=0
failed=0

# 导入函数
import_file() {
    local file="$1"
    local priority="$2"
    local content=$(cat "$file")
    
    # 跳过太短的文件
    if [ ${#content} -lt 50 ]; then
        return
    fi
    
    # 提取标题
    local title=$(head -1 "$file" | sed 's/^# //')
    if [ -z "$title" ] || [ "$title" = "$(head -1 "$file")" ]; then
        title=$(basename "$file" .md)
    fi
    
    # 使用 CLI 添加
    if node "$CLI" add "$content" --type migrated --priority "$priority" --source "$file" >/dev/null 2>&1; then
        echo "  ✅ $(basename "$file") [$priority]"
        ((success++))
    else
        echo "  ❌ $(basename "$file")"
        ((failed++))
    fi
    ((total++))
}

# 导入 topics/
echo "📁 导入 topics/..."
for file in $(find "$MEMORY_ROOT/topics" -name "*.md" -type f); do
    # 根据路径确定优先级
    if [[ "$file" == *"preferences"* ]] || [[ "$file" == *"people"* ]]; then
        import_file "$file" "P0"
    else
        import_file "$file" "P1"
    fi
done

# 导入 archive/
echo ""
echo "📁 导入 archive/..."
for file in $(find "$MEMORY_ROOT/archive" -name "*.md" -type f); do
    import_file "$file" "P2"
done

# 导入 issues/
echo ""
echo "📁 导入 issues/..."
for file in $(find "$MEMORY_ROOT/issues" -name "*.md" -type f); do
    if [[ "$file" == *"closed"* ]]; then
        import_file "$file" "P2"
    else
        import_file "$file" "P1"
    fi
done

# 导入 daily/
echo ""
echo "📁 导入 daily/..."
for file in $(find "$MEMORY_ROOT/daily" -name "*.md" -type f 2>/dev/null); do
    import_file "$file" "P2"
done

echo ""
echo "=================================================="
echo "📊 导入完成"
echo "✅ 成功: $success"
echo "❌ 失败: $failed"
echo "📦 总计: $total"
