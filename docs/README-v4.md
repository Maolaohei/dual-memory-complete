# Enhanced v4 Documentation

## Advanced Memory Management

Enhanced v4 adds intelligent compression, visualization, and active intervention on top of Core v3.

---

## Architecture

```
┌─────────────────────────────────────┐
│         Enhanced v4 Layer           │
├─────────────────────────────────────┤
│  Active Intervention (CLI)          │
│  - remember/forget/search/show      │
│  - Priority management              │
├─────────────────────────────────────┤
│  Smart Compression                  │
│  - Similarity detection             │
│  - Auto-summarization               │
├─────────────────────────────────────┤
│  Visualization                      │
│  - Timeline view                    │
│  - Stats dashboard                  │
│  - Network graph                    │
└─────────────────────────────────────┘
```

---

## Features

### 1. Smart Compression

Automatically detects and compresses similar memories.

```bash
# Preview what will be compressed
node commands/compress.js --dry-run

# Execute compression
node commands/compress.js --execute

# Custom threshold (default: 0.6)
node commands/compress.js --threshold 0.7 --execute
```

**How it works:**
1. Calculate similarity between all memory pairs
2. Group memories with similarity > threshold
3. Generate AI summary of each group
4. Replace group with single compressed memory

**Benefits:**
- ~70% storage reduction
- Faster queries
- Cleaner memory structure

### 2. Visualization

Generate three HTML views:

```bash
node commands/visualize.js
# Creates: visualization/timeline.html
#          visualization/stats.html
#          visualization/network.html
```

#### Timeline View
Chronological display of all memories.
- Color-coded by priority (P0=red, P1=orange, P2=blue)
- Scrollable timeline
- Click for details

#### Stats Dashboard
- Total memory count
- Priority distribution (bar chart)
- Access statistics
- Top tags

#### Network Graph
- D3.js force-directed graph
- Memories as nodes
- Tag relationships as edges
- Interactive drag/zoom

### 3. Active Intervention

Full CRUD control via CLI:

```bash
# Add/upgrade memory
node cli.js remember "Content" --priority P0 --tags tag1,tag2

# Search with filters
node cli.js search "keyword" --limit 10 --priority P0

# Show details
node cli.js show <memory-id>

# Delete
node cli.js forget <memory-id>

# List all
node cli.js list --priority P0 --limit 20

# Statistics
node cli.js stats
```

---

## CLI Reference

### `remember`
Add new memory or upgrade existing.

```bash
node cli.js remember "User likes strawberry donuts" \
  --priority P0 \
  --tags food,preference

# Output:
# 💾 Added new memory:
#    ID: xxx
#    Priority: P0
```

**Auto-upgrade**: If similar content exists, upgrades priority instead of creating duplicate.

### `forget`
Delete specific memory.

```bash
node cli.js forget abc123

# Output:
# 🗑️  Deleted:
#    ID: abc123
#    Content: ...
```

### `search`
Search memories with filters.

```bash
node cli.js search "donut"
node cli.js search "OpenClaw" --limit 5
node cli.js search "keyword" --priority P0

# Output:
# 🔍 Results: "donut"
# 1. [P0] User likes strawberry donuts...
#    ID: xxx | Tags: food,preference
```

### `show`
Display full memory details.

```bash
node cli.js show <id>

# Output:
# 📄 Memory Details:
# ID: xxx
# Priority: P0
# Tags: food,preference
# Access Count: 5
# Created: 2024-01-01
# Content: ...
```

### `list`
List all memories with pagination.

```bash
node cli.js list
node cli.js list --priority P0
node cli.js list --limit 50
```

### `stats`
Display system statistics.

```bash
node cli.js stats

# Output:
# 📊 Statistics
# Total: 42
# P0: 10 | P1: 20 | P2: 12
# Total Access: 156
```

---

## Compression Algorithm

### Similarity Detection

Uses keyword overlap ratio:
```javascript
similarity = (intersection_size / union_size)
```

### Grouping

Memories with similarity > threshold (default 0.6) are grouped.

### Summarization

Current implementation:
1. Extract common keywords
2. Keep most recent content as base
3. Add theme summary

Future: Use LLM for true semantic summarization.

---

## Data Flow

```
User Input
    ↓
Core v3 Store
    ↓
Enhanced v4 Management
    ↓
Compression / Visualization / CLI
```

---

## File Structure

```
v4-enhanced/
├── cli.js              # Main CLI entry
├── commands/
│   ├── compress.js    # Smart compression
│   └── visualize.js   # HTML generation
└── visualization/     # Generated files
    ├── timeline.html
    ├── stats.html
    └── network.html
```

---

## Integration with Core v3

```javascript
const core = require('../src/index.js'); // Core v3

// Use Core v3 for storage
const memories = await core.search(query);

// Use Enhanced v4 for management
const compressed = compress(memories);
```

---

## Performance

| Operation | Time |
|-----------|------|
| Compression (100 memories) | ~500ms |
| Visualization generation | ~1s |
| CLI command | <100ms |

---

## Future Enhancements

- [ ] LLM-powered summarization
- [ ] Real-time visualization updates
- [ ] Memory health scoring
- [ ] Automatic compression scheduling
- [ ] Export to PDF/CSV