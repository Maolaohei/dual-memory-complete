#!/usr/bin/env node
/**
 * 记忆可视化 - 生成时间轴、网络图、统计面板
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'memory');
const VIZ_DIR = path.join(__dirname, '..', 'visualization');

// 确保目录存在
if (!fs.existsSync(VIZ_DIR)) {
  fs.mkdirSync(VIZ_DIR, { recursive: true });
}

// 加载记忆
function loadMemories() {
  const file = path.join(MEMORY_DIR, 'memories.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return [];
}

// 生成时间轴 HTML
function generateTimeline(memories) {
  const sorted = [...memories].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  const events = sorted.map(m => ({
    date: new Date(m.createdAt).toLocaleDateString(),
    time: new Date(m.createdAt).toLocaleTimeString(),
    content: m.content.substring(0, 80) + (m.content.length > 80 ? '...' : ''),
    priority: m.priority,
    id: m.id
  }));
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>记忆时间轴</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 40px; }
    h1 { text-align: center; color: #333; margin-bottom: 30px; }
    .timeline { position: relative; max-width: 800px; margin: 0 auto; }
    .timeline::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: #ddd; }
    .event { position: relative; margin: 30px 0; }
    .event-content { position: relative; width: 45%; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .event:nth-child(odd) .event-content { margin-left: 55%; }
    .event:nth-child(even) .event-content { margin-right: 55%; }
    .event-date { font-size: 12px; color: #999; margin-bottom: 5px; }
    .event-text { color: #333; line-height: 1.5; }
    .priority-P0 { border-left: 4px solid #e74c3c; }
    .priority-P1 { border-left: 4px solid #f39c12; }
    .priority-P2 { border-left: 4px solid #3498db; }
    .dot { position: absolute; left: 50%; top: 20px; width: 12px; height: 12px; background: #3498db; border-radius: 50%; transform: translateX(-50%); }
    .stats { text-align: center; margin-bottom: 30px; color: #666; }
  </style>
</head>
<body>
  <h1>🧠 记忆时间轴</h1>
  <div class="stats">共 ${memories.length} 条记忆</div>
  <div class="timeline">
    ${events.map(e => `
    <div class="event">
      <div class="dot"></div>
      <div class="event-content priority-${e.priority}">
        <div class="event-date">${e.date} ${e.time}</div>
        <div class="event-text">${e.content}</div>
      </div>
    </div>
    `).join('')}
  </div>
</body>
</html>`;
  
  fs.writeFileSync(path.join(VIZ_DIR, 'timeline.html'), html);
  console.log('✅ 时间轴已生成: visualization/timeline.html');
}

// 生成统计面板
function generateStats(memories) {
  const p0 = memories.filter(m => m.priority === 'P0').length;
  const p1 = memories.filter(m => m.priority === 'P1').length;
  const p2 = memories.filter(m => m.priority === 'P2').length;
  
  const totalAccess = memories.reduce((sum, m) => sum + (m.accessCount || 0), 0);
  const avgAccess = memories.length > 0 ? (totalAccess / memories.length).toFixed(2) : 0;
  
  // 标签统计
  const tagCount = {};
  memories.forEach(m => {
    m.tags.forEach(t => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>记忆统计面板</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 40px; }
    h1 { text-align: center; color: #333; margin-bottom: 40px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; max-width: 1000px; margin: 0 auto; }
    .card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card h3 { color: #666; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; }
    .card .number { font-size: 36px; font-weight: bold; color: #333; }
    .card .detail { color: #999; font-size: 14px; margin-top: 5px; }
    .priority-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .p0 { background: #e74c3c; }
    .p1 { background: #f39c12; }
    .p2 { background: #3498db; }
    .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .tag { background: #ecf0f1; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>📊 记忆统计面板</h1>
  <div class="grid">
    <div class="card">
      <h3>总记忆数</h3>
      <div class="number">${memories.length}</div>
      <div class="priority-bar">
        <div class="p0" style="width: ${(p0/memories.length*100)||0}%"></div>
        <div class="p1" style="width: ${(p1/memories.length*100)||0}%"></div>
        <div class="p2" style="width: ${(p2/memories.length*100)||0}%"></div>
      </div>
      <div class="detail">P0: ${p0} | P1: ${p1} | P2: ${p2}</div>
    </div>
    
    <div class="card">
      <h3>总访问次数</h3>
      <div class="number">${totalAccess}</div>
      <div class="detail">平均 ${avgAccess} 次/条</div>
    </div>
    
    <div class="card">
      <h3>热门标签</h3>
      <div class="tags">
        ${topTags.map(([tag, count]) => `<span class="tag">${tag} (${count})</span>`).join('')}
        ${topTags.length === 0 ? '<span class="tag">无标签</span>' : ''}
      </div>
    </div>
    
    <div class="card">
      <h3>存储状态</h3>
      <div class="number">健康</div>
      <div class="detail">最后更新: ${new Date().toLocaleString()}</div>
    </div>
  </div>
</body>
</html>`;
  
  fs.writeFileSync(path.join(VIZ_DIR, 'stats.html'), html);
  console.log('✅ 统计面板已生成: visualization/stats.html');
}

// 生成网络图（记忆关联）
function generateNetwork(memories) {
  // 简化的网络：基于标签关联
  const nodes = memories.map((m, i) => ({
    id: m.id,
    label: m.content.substring(0, 20) + '...',
    priority: m.priority,
    group: m.tags[0] || 'default'
  }));
  
  const links = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const sharedTags = memories[i].tags.filter(t => memories[j].tags.includes(t));
      if (sharedTags.length > 0) {
        links.push({
          source: memories[i].id,
          target: memories[j].id,
          value: sharedTags.length
        });
      }
    }
  }
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>记忆网络图</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body { margin: 0; font-family: sans-serif; background: #f5f5f5; }
    h1 { text-align: center; padding: 20px; }
    #graph { width: 100%; height: 600px; }
    .node { cursor: pointer; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .label { font-size: 10px; pointer-events: none; }
  </style>
</head>
<body>
  <h1>🕸️ 记忆关联网络</h1>
  <div id="graph"></div>
  <script>
    const nodes = ${JSON.stringify(nodes)};
    const links = ${JSON.stringify(links)};
    
    const width = window.innerWidth;
    const height = 600;
    
    const color = d3.scaleOrdinal()
      .domain(['P0', 'P1', 'P2'])
      .range(['#e74c3c', '#f39c12', '#3498db']);
    
    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));
    
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-width', d => Math.sqrt(d.value));
    
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('class', 'node')
      .attr('r', d => d.priority === 'P0' ? 15 : d.priority === 'P1' ? 10 : 8)
      .attr('fill', d => color(d.priority))
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .attr('class', 'label')
      .text(d => d.label)
      .attr('dx', 12)
      .attr('dy', 4);
    
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
      
      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
    
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
  
  fs.writeFileSync(path.join(VIZ_DIR, 'network.html'), html);
  console.log('✅ 网络图已生成: visualization/network.html');
}

// 主函数
async function visualize() {
  console.log('📊 生成可视化...\n');
  
  const memories = loadMemories();
  
  if (memories.length === 0) {
    console.log('⚠️  没有找到记忆数据');
    return;
  }
  
  generateTimeline(memories);
  generateStats(memories);
  generateNetwork(memories);
  
  console.log('\n✨ 全部可视化已生成!');
  console.log('   用浏览器打开 visualization/ 目录查看');
}

// CLI
if (require.main === module) {
  visualize().catch(console.error);
}

module.exports = { visualize };