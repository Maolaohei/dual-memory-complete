#!/bin/bash
# 记忆去重定时任务
# 每周日凌晨 2 点执行

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUAL_MEMORY_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$DUAL_MEMORY_DIR/logs/deduplicate.log"

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 记录开始时间
echo "================================" >> "$LOG_FILE"
echo "去重任务开始: $(date)" >> "$LOG_FILE"

# 执行去重
cd "$DUAL_MEMORY_DIR"
node deduplicate.js >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

# 记录结果
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 去重完成" >> "$LOG_FILE"
else
    echo "❌ 去重失败 (exit code: $EXIT_CODE)" >> "$LOG_FILE"
fi

echo "结束时间: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
