#!/bin/bash
# NanoBot 记忆迁移 - 使用 CLI store 命令

CLI="/root/.nanobot/workspace/dual-memory-complete/cli.js"
MEMORY_ROOT="/root/.nanobot/workspace/memory"

echo "🦇 NanoBot 记忆迁移 (CLI 版)"
echo ""

# 计数器
total=0
success=0

# 迁移函数
migrate_file() {
    local file="$1"
    local priority="$2"
    local type="$3"
    
    local content=$(cat "$file")
    local title=$(basename "$file" .md)
    
    # 跳过太短的文件
    if [ ${#content} -lt 100 ]; then
        return
    fi
    
    echo "处理: $title [$priority]"
    
    # 使用 CLI store 命令
    if echo "$content" | node "$CLI" store --type "$type" --priority "$priority" 2>&1 | grep -q "存储成功"; then
        ((success++))
    fi
    ((total++))
}

# 导入 topics/
echo "📁 导入 topics/..."
for file in $(find "$MEMORY_ROOT/topics" -name "*.md" -type f); do
    if [[ "$file" == *"preferences"* ]] || [[ "$file" == *"people"* ]]; then
        migrate_file "$file" "P0" "preference"
    else
        migrate_file "$file" "P1" "knowledge"
    fi
done

echo ""
echo "📊 完成: 成功 $success / 总计 $total"
