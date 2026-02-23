# Architecture Design

## Dual-Memory Complete System Design

---

## Overview

Dual-Memory Complete is a **layered architecture** combining:
- **Core v3**: Production-grade vector storage
- **Enhanced v4**: Intelligent management layer

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  - OpenClaw Agent                                           │
│  - Custom Scripts                                           │
│  - Third-party Integrations                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Enhanced v4 Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Smart      │  │  Visualize  │  │   Active    │         │
│  │Compression  │  │             │  │Intervention │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  - Deduplication        - Timeline      - remember/forget   │
│  - Auto-summarize       - Stats         - search/show       │
│  - Batch operations     - Network       - stats/list        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core v3 Layer                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                 Smart Extractor                        ││
│  │  - Auto-detect important info                          ││
│  │  - Priority classification                             ││
│  │  - Conflict detection                                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Memory Store (LanceDB)                    ││
│  │  - Vector storage (384-dim)                            ││
│  │  - Semantic search (~30ms)                             ││
│  │  - Timeline versioning                                 ││
│  │  - Dynamic decay (P0/P1/P2)                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │            Transformers.js Embeddings                  ││
│  │  - paraphrase-multilingual-MiniLM-L12-v2              ││
│  │  - Local processing (no API)                           ││
│  │  - 100+ languages                                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  LanceDB     │  │   JSON       │  │  Timeline    │      │
│  │  (Vectors)   │  │   (Config)   │  │  (History)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Write Flow

```
1. User Input
   ↓
2. Smart Extractor (Core v3)
   - Analyze importance
   - Assign priority
   - Detect conflicts
   ↓
3. Transformers.js (Core v3)
   - Generate embedding (384-dim)
   ↓
4. LanceDB Store (Core v3)
   - Save vector + metadata
   - Update timeline
   ↓
5. Return confirmation
```

### Read Flow

```
1. Query Input
   ↓
2. Transformers.js (Core v3)
   - Generate query embedding
   ↓
3. LanceDB Search (Core v3)
   - Semantic similarity search
   - Return top-k results
   ↓
4. Enhanced v4 (optional)
   - Filter by priority
   - Sort by access count
   - Format for display
   ↓
5. Return results
```

### Compression Flow

```
1. Scan all memories
   ↓
2. Calculate similarity matrix
   ↓
3. Group similar memories (threshold > 0.6)
   ↓
4. Generate summary for each group
   - Extract common keywords
   - Keep most recent as base
   - Add theme tags
   ↓
5. Replace groups with summaries
   ↓
6. Update database
```

---

## Component Details

### 1. Smart Extractor

**Purpose**: Analyze content and extract metadata

**Process**:
```javascript
Input: "User likes strawberry donuts from Mister Donut"
  ↓
Priority Detection:
  - Keywords: "likes" → P1
  - Specificity: brand mentioned → +1 → P0
  ↓
Topic Extraction:
  - food, preference, strawberry
  ↓
Conflict Check:
  - Search for "dislikes donuts"
  - Flag if found
  ↓
Output: { content, priority: "P0", tags: ["food", ...] }
```

### 2. Memory Store (LanceDB)

**Schema**:
```sql
Table: memories
  - id: STRING
  - content: STRING
  - embedding: VECTOR(384)
  - priority: STRING
  - tags: LIST<STRING>
  - created_at: TIMESTAMP
  - updated_at: TIMESTAMP
  - access_count: INT
```

**Indexes**:
- Primary: id
- Vector: embedding (IVF_PQ)
- Filter: priority, tags

### 3. Timeline System

**Purpose**: Full audit trail of all changes

**Format**:
```json
{
  "memory_id": "uuid",
  "events": [
    {
      "action": "create",
      "timestamp": "2024-01-01T00:00:00Z",
      "data": { "content": "...", "priority": "P0" }
    },
    {
      "action": "update",
      "timestamp": "2024-01-02T00:00:00Z",
      "changes": { "priority": "P0→P1" }
    }
  ]
}
```

### 4. Dynamic Decay

**Algorithm**:
```javascript
function calculateRelevance(memory, now) {
  const age = now - memory.createdAt;
  const decayPeriod = {
    "P0": 365 * 24 * 60 * 60 * 1000,  // 365 days
    "P1": 30 * 24 * 60 * 60 * 1000,   // 30 days
    "P2": 7 * 24 * 60 * 60 * 1000     // 7 days
  }[memory.priority];
  
  const relevance = Math.exp(-age / decayPeriod);
  return relevance * memory.accessCount;
}
```

---

## Security Considerations

### Data Isolation
- Each user has separate LanceDB instance
- No cross-user data access

### Sensitive Data
- Session files excluded from git
- No API keys in code
- Configurable encryption at rest

### Privacy
- All processing local
- No external API calls (except optional)
- User controls all data

---

## Scalability

### Current Limits
- Tested: 100K memories
- Query: <50ms
- Storage: ~1GB per 100K memories

### Scaling Strategies
1. **Sharding**: Split by time periods
2. **Indexing**: Optimize vector indexes
3. **Caching**: Cache frequent queries
4. **Archiving**: Move old memories to cold storage

---

## Performance Optimizations

### Implemented
- ✅ Batch writes
- ✅ Vector indexing (IVF_PQ)
- ✅ Lazy loading
- ✅ Priority filtering

### Planned
- ⏳ Query result caching
- ⏳ Async compression
- ⏳ Distributed storage

---

## Error Handling

### Graceful Degradation
```
LanceDB unavailable
  ↓
Fallback to JSON storage
  ↓
Warn user, continue operation
```

### Recovery
- Automatic backup every 24h
- Timeline for audit/revert
- Export/import functionality

---

## Future Architecture

### Phase 1: Current
- Local storage only
- Single user
- Sync via file copy

### Phase 2: Multi-User
- User authentication
- Access control
- Shared memories

### Phase 3: Distributed
- Cloud sync
- Multi-device
- Real-time collaboration

---

## Design Principles

1. **Privacy First** - Local processing, user controls data
2. **Simplicity** - Clear APIs, minimal dependencies
3. **Extensibility** - Plugin architecture
4. **Performance** - Sub-100ms operations
5. **Reliability** - No silent failures, full audit trail