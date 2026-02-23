# API Reference

## Dual-Memory Complete JavaScript API

---

## Core v3 API

### MemoryStore

Main class for vector memory operations.

#### Constructor

```javascript
const { MemoryStore } = require('./src/memory-store.js');

const store = new MemoryStore({
  dbPath: './lancedb/memories.lance',
  embeddingModel: 'paraphrase-multilingual-MiniLM-L12-v2'
});
```

#### Methods

##### `async init()`
Initialize the store and load embedding model.

```javascript
await store.init();
```

**Returns**: `Promise<void>`

---

##### `async store(content, options)`
Store a new memory.

```javascript
const id = await store.store(
  "User likes strawberry donuts",
  {
    type: "preference",
    topic: "food",
    priority: "P0",
    tags: ["food", "preference"]
  }
);
```

**Parameters**:
- `content` (string): Memory content
- `options` (object):
  - `type` (string): Memory type
  - `topic` (string): Topic category
  - `priority` (string): "P0" | "P1" | "P2"
  - `tags` (string[]): Associated tags

**Returns**: `Promise<string>` - Memory ID

---

##### `async search(query, options)`
Semantic search for memories.

```javascript
const results = await store.search("strawberry donut", {
  limit: 10,
  priority: "P0",
  minScore: 0.7
});
```

**Parameters**:
- `query` (string): Search query
- `options` (object):
  - `limit` (number): Max results (default: 10)
  - `priority` (string): Filter by priority
  - `minScore` (number): Minimum similarity (0-1)

**Returns**: `Promise<Array<Memory>>`

```typescript
interface Memory {
  id: string;
  content: string;
  priority: string;
  tags: string[];
  score: number;
  createdAt: string;
}
```

---

##### `async delete(id)`
Delete a memory by ID.

```javascript
await store.delete("memory-uuid");
```

**Parameters**:
- `id` (string): Memory ID

**Returns**: `Promise<boolean>`

---

##### `async update(id, updates)`
Update a memory.

```javascript
await store.update("memory-uuid", {
  priority: "P1",
  tags: ["food", "snack"]
});
```

**Parameters**:
- `id` (string): Memory ID
- `updates` (object): Fields to update

**Returns**: `Promise<boolean>`

---

##### `async getTimeline(id)`
Get full timeline for a memory.

```javascript
const timeline = await store.getTimeline("memory-uuid");
```

**Returns**: `Promise<Array<TimelineEvent>>`

```typescript
interface TimelineEvent {
  action: "create" | "update" | "delete";
  timestamp: string;
  data: object;
}
```

---

##### `async close()`
Close the store and release resources.

```javascript
await store.close();
```

---

### SmartExtractor

Utility for analyzing and extracting metadata from content.

#### Methods

##### `extractPriority(content)`
Automatically determine priority.

```javascript
const { SmartExtractor } = require('./src/smart-extractor.js');

const priority = SmartExtractor.extractPriority(
  "This is very important!"
);
// Returns: "P0"
```

**Parameters**:
- `content` (string): Content to analyze

**Returns**: `string` - "P0", "P1", or "P2"

---

##### `extractTopics(content)`
Extract topics/tags from content.

```javascript
const topics = SmartExtractor.extractTopics(
  "User likes strawberry donuts from Mister Donut"
);
// Returns: ["food", "preference", "strawberry"]
```

**Parameters**:
- `content` (string): Content to analyze

**Returns**: `Array<string>`

---

##### `detectConflicts(content, existingMemories)`
Detect potential conflicts.

```javascript
const conflicts = SmartExtractor.detectConflicts(
  "User hates cats",
  existingMemories
);
// Returns: [{ memoryId: "xxx", similarity: 0.9 }]
```

**Parameters**:
- `content` (string): New content
- `existingMemories` (Array): Current memories

**Returns**: `Array<Conflict>`

---

## Enhanced v4 API

### BrowserHelper

For web scraping with anti-bot detection.

```javascript
const { BrowserHelper } = require('./browser-helper/src/browser-helper.js');

const helper = new BrowserHelper();
```

#### Methods

##### `async autoFetch(url, options)`
Fetch content with automatic fallback.

```javascript
const result = await helper.autoFetch("https://example.com", {
  platform: "xhs"
});
```

**Parameters**:
- `url` (string): URL to fetch
- `options` (object):
  - `platform` (string): Platform identifier for session

**Returns**: `Promise<FetchResult>`

```typescript
interface FetchResult {
  success: boolean;
  method: "jina" | "playwright";
  content: string;
  title?: string;
}
```

---

##### `async login(platform)`
Login and save session.

```javascript
await helper.login("xhs");
// Opens browser for manual login
```

**Parameters**:
- `platform` (string): Platform identifier

---

### Compression

Smart compression utilities.

```javascript
const { compress } = require('./v4-enhanced/commands/compress.js');
```

##### `compress(options)`
Compress similar memories.

```javascript
const result = await compress({
  threshold: 0.6,
  dryRun: true
});
```

**Parameters**:
- `options` (object):
  - `threshold` (number): Similarity threshold (0-1)
  - `dryRun` (boolean): Preview only

**Returns**: `Promise<CompressionResult>`

```typescript
interface CompressionResult {
  groups: Array<MemoryGroup>;
  saved: number;
  compressed: number;
}
```

---

### Visualization

Generate visualization files.

```javascript
const { visualize } = require('./v4-enhanced/commands/visualize.js');
```

##### `visualize()`
Generate all visualization files.

```javascript
await visualize();
// Creates: timeline.html, stats.html, network.html
```

**Returns**: `Promise<void>`

---

## Event Hooks

### Memory Lifecycle Hooks

```javascript
const memory = require('./src/index.js');

// Before store
memory.on('beforeStore', (content, options) => {
  console.log('Storing:', content);
});

// After store
memory.on('afterStore', (id, memory) => {
  console.log('Stored with ID:', id);
});

// On search
memory.on('search', (query, results) => {
  console.log('Searched:', query, 'Found:', results.length);
});
```

---

## Configuration

### Environment Variables

```bash
# Memory storage path
export MEMORY_DIR="/custom/path"

# LanceDB configuration
export LANCE_BATCH_SIZE=1000
export LANCE_CACHE_SIZE=100

# Embedding model
export EMBEDDING_MODEL="paraphrase-multilingual-MiniLM-L12-v2"

# Logging
export MEMORY_LOG_LEVEL="info"
```

---

## Error Handling

All async methods throw descriptive errors:

```javascript
try {
  await store.store("content");
} catch (error) {
  if (error.code === 'DB_LOCKED') {
    // Database is locked by another process
  } else if (error.code === 'MODEL_LOAD_FAILED') {
    // Embedding model failed to load
  }
}
```

**Error Codes**:
- `DB_LOCKED` - Database is locked
- `MODEL_LOAD_FAILED` - Embedding model error
- `INVALID_PRIORITY` - Invalid priority value
- `NOT_FOUND` - Memory not found

---

## TypeScript Types

```typescript
declare module 'dual-memory' {
  export interface Memory {
    id: string;
    content: string;
    type: string;
    topic: string;
    priority: 'P0' | 'P1' | 'P2';
    tags: string[];
    embedding: number[];
    createdAt: string;
    updatedAt: string;
    accessCount: number;
  }

  export interface SearchOptions {
    limit?: number;
    priority?: 'P0' | 'P1' | 'P2';
    minScore?: number;
  }

  export class MemoryStore {
    constructor(options: { dbPath: string });
    init(): Promise<void>;
    store(content: string, options: object): Promise<string>;
    search(query: string, options?: SearchOptions): Promise<Memory[]>;
    delete(id: string): Promise<boolean>;
    close(): Promise<void>;
  }
}
```

---

## Examples

### Basic Agent Integration

```javascript
const { MemoryStore } = require('dual-memory');

class MyAgent {
  constructor() {
    this.memory = new MemoryStore();
  }

  async init() {
    await this.memory.init();
  }

  async remember(info, priority = "P1") {
    return await this.memory.store(info, { priority });
  }

  async recall(query) {
    return await this.memory.search(query, { limit: 5 });
  }
}
```

### Compression Workflow

```javascript
const { compress } = require('./v4-enhanced/commands/compress.js');

// Weekly compression job
async function weeklyCompression() {
  const result = await compress({
    threshold: 0.6,
    dryRun: false
  });
  
  console.log(`Compressed ${result.compressed} memories`);
  console.log(`Saved ${result.saved} entries`);
}
```

---

## See Also

- [Core v3 Docs](./README-v3.md)
- [Enhanced v4 Docs](./README-v4.md)
- [Architecture](./ARCHITECTURE.md)