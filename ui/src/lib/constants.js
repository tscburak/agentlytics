export const EDITOR_COLORS = {
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
};

export const EDITOR_LABELS = {
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
  'windsurf-next': 'Windsurf Next',
  'antigravity': 'Antigravity',
  'claude-code': 'Claude Code',
  'claude': 'Claude Code',
  'vscode': 'VS Code',
  'vscode-insiders': 'VS Code Insiders',
  'zed': 'Zed',
  'opencode': 'OpenCode',
};

export function editorColor(src) {
  return EDITOR_COLORS[src] || '#6b7280';
}

export function editorLabel(src) {
  return EDITOR_LABELS[src] || src;
}

export function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}
