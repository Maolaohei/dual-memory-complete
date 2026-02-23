# Core v3 Documentation

## Vector Memory System

Core v3 is the foundation of Dual-Memory - a production-grade vector-based memory system using LanceDB and local embeddings.

---

## Architecture

```
┌─────────────────────────────────────┐
│           Core v3 Layer             │
├─────────────────────────────────────┤
│  Smart Extractor                    │
│  - Auto-detect important info       │
│  - Priority classification          │
├─────────────────────────────────────┤
│  Memory Store (LanceDB)             │
│  - Vector storage                   │
│  - Semantic search                  │
│  - Timeline versioning              │
├─────────────────────────────────────┤
│  Transformers.js                    │
│  - Local embeddings (384-dim)       │
│  - No API calls needed              │
└─────────────────────────────────────┘
```

---

## Key Features

### 1. LanceDB Vector Storage

- **Local database** - No external services
- **Fast queries** - ~30ms semantic search
- **Persistent** - Data survives restarts
- **Scalable** - Handles 10K+ memories

### 2. Local Embeddings

- **Model**: `paraphrase-multilingual-MiniLM-L12-v2`
- **Dimensions**: 384
- **Language**: Multilingual (100+)
- **Offline**: Runs entirely locally

### 3. Timeline Versioning

```javascript
// Each memory has full history
{
  id: "unique-id",
  content: "User likes strawberry donuts",
  priority: "P0",
  timeline: [
    { action: "create", timestamp: "...", content: "..." },
    { action: "update", timestamp: "...", content: "..." }
  ]
}
```

### 4. Conflict Detection

Automatically detects contradictory memories:
```javascript
// Example conflict
{ content: "User likes cats", priority: "P0" }
{ content: "User hates cats", priority: "P0" }
// → System flags for review
```

### 5. Dynamic Decay

| Priority | Decay Period | Use Case |
|----------|--------------|----------|
| P0 | 365 days | Permanent preferences |
| P1 | 30 days | Project status |
| P2 | 7 days | Temporary context |

---

## CLI Usage

### Status Check
```bash
node cli.js status
# Shows: total memories, storage size, health metrics
```

### Add Memory
```bash
node cli.js add "Content to remember" \
  --type preference \
  --topic food \
  --priority P0
```

### Search
```bash
# Semantic search
node cli.js search "strawberry donut"

# Filter by type
node cli.js filter --type preference

# Filter by priority
node cli.js filter --priority P0
```

### Timeline
```bash
node cli.js timeline
# Shows chronological history
```

### Delete
```bash
node cli.js delete <memory-id>
```

---

## Data Schema

```javascript
{
  id: "uuid",
  content: "string",
  type: "system|preference|task|...",
  topic: "string",
  priority: "P0|P1|P2",
  embedding: [384-dim vector],
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp",
  accessCount: number,
  timeline: [
    { action: "create|update|delete", timestamp: "...", data: {} }
  ]
}
```

---

## Scripts

### Auto Archive
```bash
# Dry run
npm run archive:dry

# Execute
npm run archive
```

### Deduplication
```bash
./scripts/deduplicate-cron.sh
```

### Startup Check
```bash
./scripts/startup-check.sh
```

---

## Storage Location

```
~/.openclaw/workspace/skills/dual-memory/
├── lancedb/              # Vector database
│   └── memories.lance/
├── timeline.jsonl        # Timeline history
└── src/
    └── memory-store.js   # Core store
```

---

## Performance

| Metric | Value |
|--------|-------|
| Write latency | ~50ms |
| Search latency | ~30ms |
| Embedding time | ~100ms |
| Max memories | 100K+ tested |

---

## Integration

### With OpenClaw
```javascript
// In your agent
const memory = require('./skills/dual-memory/src/index.js');

// Store
await memory.store("Important info", { priority: "P0" });

// Retrieve
const results = await memory.retrieve("query");
```

---

## Troubleshooting

### Database locked
```bash
# Kill any hanging processes
pkill -f node
rm -rf lancedb/*.lock
```

### Out of memory
```bash
# Reduce batch size
export LANCE_BATCH_SIZE=100
```

### Slow queries
```bash
# Rebuild index
node cli.js rebuild-index
```

---

## API Reference

See [API.md](./API.md) for full JavaScript API documentation.