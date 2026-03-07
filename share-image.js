/**
 * Generates a shareable SVG stats card from cached data.
 */

function fmt(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const EDITOR_COLORS = {
  'cursor': '#f59e0b',
  'windsurf': '#06b6d4',
  'windsurf-next': '#22d3ee',
  'antigravity': '#a78bfa',
  'claude-code': '#f97316',
  'claude': '#f97316',
  'vscode': '#3b82f6',
  'vscode-insiders': '#60a5fa',
  'zed': '#10b981',
  'opencode': '#ec4899',
  'gemini-cli': '#4285f4',
  'copilot-cli': '#8957e5',
};

const EDITOR_LABELS = {
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
  'windsurf-next': 'WS Next',
  'antigravity': 'Antigravity',
  'claude-code': 'Claude Code',
  'claude': 'Claude Code',
  'vscode': 'VS Code',
  'vscode-insiders': 'VS Code Ins.',
  'zed': 'Zed',
  'opencode': 'OpenCode',
  'gemini-cli': 'Gemini CLI',
  'copilot-cli': 'Copilot CLI',
};

function generateShareSvg(overview, stats) {
  const W = 800, H = 440;
  const F = "Menlo, Monaco, Cascadia Code, Courier New, monospace";
  const editors = overview.editors || [];
  const tk = stats.tokens || {};
  const streaks = stats.streaks || {};
  const topModels = (stats.topModels || []).slice(0, 5);

  // Editor bar chart
  const maxEditorCount = Math.max(...editors.map(e => e.count), 1);
  const editorBars = editors.slice(0, 8).map((e, i) => {
    const barW = Math.max((e.count / maxEditorCount) * 180, 4);
    const color = EDITOR_COLORS[e.id] || '#6b7280';
    const label = (EDITOR_LABELS[e.id] || e.id).padEnd(12);
    const y = 170 + i * 22;
    return `
      <text x="30" y="${y + 12}" fill="#888" font-size="10" font-family="${F}">${esc(label)}</text>
      <rect x="140" y="${y + 1}" width="${barW}" height="14" fill="${color}" opacity="0.8"/>
      <text x="${146 + barW}" y="${y + 12}" fill="#aaa" font-size="9" font-family="${F}">${e.count}</text>
    `;
  }).join('');

  // Activity sparkline from hourly data
  const hourly = stats.hourly || new Array(24).fill(0);
  const maxH = Math.max(...hourly, 1);
  const sparkW = 180, sparkH = 40;
  const sparkPoints = hourly.map((v, i) => {
    const x = 590 + (i / 23) * sparkW;
    const y = 180 + sparkH - (v / maxH) * sparkH;
    return `${x},${y}`;
  }).join(' ');

  // Top models list
  const modelsList = topModels.map((m, i) => {
    const y = 274 + i * 16;
    const name = m.name.length > 24 ? m.name.substring(0, 24) : m.name;
    return `<text x="590" y="${y}" fill="#888" font-size="9" font-family="${F}">${esc(name)} <tspan fill="#555">${m.count}</tspan></text>`;
  }).join('');

  const dateStr = new Date().toISOString().split('T')[0];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#000"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#222" stroke-width="1"/>

  <!-- Terminal title bar -->
  <rect x="0" y="0" width="${W}" height="32" fill="#111"/>
  <text x="${W / 2}" y="20" fill="#555" font-size="11" font-family="${F}" text-anchor="middle">agentlytics</text>

  <!-- Prompt line -->
  <text x="24" y="58" fill="#666" font-size="12" font-family="${F}">$</text>
  <text x="40" y="58" fill="#ccc" font-size="12" font-family="${F}">npx agentlytics</text>

  <!-- Divider -->
  <line x1="24" y1="68" x2="${W - 24}" y2="68" stroke="#222" stroke-width="1"/>

  <!-- KPI row -->
  <rect x="24" y="78" width="175" height="58" fill="#111"/>
  <text x="36" y="96" fill="#666" font-size="9" font-family="${F}">sessions</text>
  <text x="36" y="122" fill="#fff" font-size="22" font-weight="bold" font-family="${F}">${fmt(overview.totalChats)}</text>

  <rect x="210" y="78" width="175" height="58" fill="#111"/>
  <text x="222" y="96" fill="#666" font-size="9" font-family="${F}">tokens</text>
  <text x="222" y="122" fill="#fff" font-size="22" font-weight="bold" font-family="${F}">${fmt((tk.input || 0) + (tk.output || 0))}</text>

  <rect x="396" y="78" width="175" height="58" fill="#111"/>
  <text x="408" y="96" fill="#666" font-size="9" font-family="${F}">active_days</text>
  <text x="408" y="122" fill="#fff" font-size="22" font-weight="bold" font-family="${F}">${streaks.totalDays || 0}</text>

  <rect x="582" y="78" width="194" height="58" fill="#111"/>
  <text x="594" y="96" fill="#666" font-size="9" font-family="${F}">streak <tspan fill="#555">longest:${streaks.longest || 0}</tspan></text>
  <text x="594" y="122" fill="#fff" font-size="22" font-weight="bold" font-family="${F}">${streaks.current || 0} <tspan font-size="11" fill="#666">day${(streaks.current || 0) !== 1 ? 's' : ''}</tspan></text>

  <!-- Editors section -->
  <text x="24" y="160" fill="#666" font-size="10" font-family="${F}"># editors</text>
  ${editorBars}

  <!-- Right column: Peak Hours -->
  <text x="590" y="160" fill="#666" font-size="10" font-family="${F}"># peak_hours</text>
  <polyline points="${sparkPoints}" fill="none" stroke="#888" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="590" y="${180 + sparkH + 14}" fill="#555" font-size="8" font-family="${F}">00:00</text>
  <text x="${590 + sparkW - 28}" y="${180 + sparkH + 14}" fill="#555" font-size="8" font-family="${F}">23:00</text>

  <!-- Top Models -->
  <text x="590" y="258" fill="#666" font-size="10" font-family="${F}"># models</text>
  ${modelsList}

  <!-- Token breakdown -->
  <line x1="24" y1="${H - 62}" x2="${W - 24}" y2="${H - 62}" stroke="#222" stroke-width="1"/>
  <text x="24" y="${H - 44}" fill="#666" font-size="9" font-family="${F}">in:${fmt(tk.input)}  out:${fmt(tk.output)}  cache:${fmt(tk.cacheRead)}  tools:${fmt(stats.totalToolCalls || 0)}  editors:${editors.length}</text>

  <!-- Footer -->
  <line x1="24" y1="${H - 28}" x2="${W - 24}" y2="${H - 28}" stroke="#222" stroke-width="1"/>
  <text x="24" y="${H - 10}" fill="#555" font-size="9" font-family="${F}">github.com/f/agentlytics</text>
  <text x="${W - 24}" y="${H - 10}" fill="#555" font-size="9" font-family="${F}" text-anchor="end">${esc(dateStr)}</text>
</svg>`;

  return svg;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateShareSvg };
