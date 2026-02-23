#!/bin/bash
# 自动归档系统 - Crontab 入口
# 替换: /root/.openclaw/workspace/memory-v2.1/auto_archive.sh

cd /root/.openclaw/workspace/skills/dual-memory
/usr/bin/node scripts/auto-archive.js --report >> /var/log/dual-memory-archive.log 2>&1
