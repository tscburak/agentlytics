const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const http = require('http');

const HOME = os.homedir();

// Windsurf-family variants: Windsurf, Windsurf Next, Antigravity
const VARIANTS = [
  { id: 'windsurf', matchKey: 'ide', matchVal: 'windsurf', https: false },
  { id: 'windsurf-next', matchKey: 'ide', matchVal: 'windsurf-next', https: false },
  { id: 'antigravity', matchKey: 'appDataDir', matchVal: 'antigravity', https: true },
];

// ============================================================
// Find running Windsurf language server (port + CSRF token)
// ============================================================

let _lsCache = null;

function findLanguageServers() {
  if (_lsCache) return _lsCache;
  _lsCache = [];
  try {
    const ps = execSync('ps aux', { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
    for (const line of ps.split('\n')) {
      if (!line.includes('language_server_macos') || !line.includes('--csrf_token')) continue;
      const csrfMatch = line.match(/--csrf_token\s+(\S+)/);
      const ideMatch = line.match(/--ide_name\s+(\S+)/);
      const appDirMatch = line.match(/--app_data_dir\s+(\S+)/);
      if (!csrfMatch) continue;
      const csrf = csrfMatch[1];
      const ide = ideMatch ? ideMatch[1] : 'windsurf';
      const appDataDir = appDirMatch ? appDirMatch[1] : null;
      // Find port by checking listening sockets for this process
      const pidMatch = line.match(/^\S+\s+(\d+)/);
      if (!pidMatch) continue;
      const pid = pidMatch[1];
      try {
        const lsof = execSync(`lsof -i TCP -P -n -a -p ${pid} 2>/dev/null`, { encoding: 'utf-8' });
        for (const l of lsof.split('\n')) {
          const portMatch = l.match(/TCP\s+127\.0\.0\.1:(\d+)\s+\(LISTEN\)/);
          if (portMatch) {
            _lsCache.push({ ide, appDataDir, port: parseInt(portMatch[1]), csrf, pid });
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* ps failed */ }
  return _lsCache;
}

function getLsForVariant(variant) {
  const servers = findLanguageServers();
  let matches;
  if (variant.matchKey === 'appDataDir') {
    matches = servers.filter(s => s.appDataDir === variant.matchVal);
  } else {
    // Exclude servers that have appDataDir set (they belong to a different variant)
    matches = servers.filter(s => s.ide === variant.matchVal && !s.appDataDir);
  }
  return matches.length > 0 ? matches[0] : null;
}

// ============================================================
// Connect protocol HTTP client for language server RPC
// ============================================================

function callRpc(port, csrf, method, body, useHttps) {
  const data = JSON.stringify(body || {});
  const scheme = useHttps ? 'https' : 'http';
  const url = `${scheme}://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/${method}`;
  const insecure = useHttps ? '-k ' : '';
  try {
    const result = execSync(
      `curl -s ${insecure}-X POST ${JSON.stringify(url)} ` +
      `-H "Content-Type: application/json" ` +
      `-H "x-codeium-csrf-token: ${csrf}" ` +
      `-d ${JSON.stringify(data)} ` +
      `--max-time 10`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
    return JSON.parse(result);
  } catch { return null; }
}

// ============================================================
// Adapter interface
// ============================================================

const name = 'windsurf';
const sources = ['windsurf', 'windsurf-next', 'antigravity'];

function getChats() {
  const chats = [];

  for (const variant of VARIANTS) {
    const ls = getLsForVariant(variant);
    if (!ls) continue;

    const resp = callRpc(ls.port, ls.csrf, 'GetAllCascadeTrajectories', {}, variant.https);
    if (!resp || !resp.trajectorySummaries) continue;

    for (const [cascadeId, summary] of Object.entries(resp.trajectorySummaries)) {
      const ws = (summary.workspaces || [])[0];
      const folder = ws?.workspaceFolderAbsoluteUri?.replace('file://', '') || null;
      chats.push({
        source: variant.id,
        composerId: cascadeId,
        name: summary.summary || null,
        createdAt: summary.createdTime ? new Date(summary.createdTime).getTime() : null,
        lastUpdatedAt: summary.lastModifiedTime ? new Date(summary.lastModifiedTime).getTime() : null,
        mode: 'cascade',
        folder,
        encrypted: false,
        _port: ls.port,
        _csrf: ls.csrf,
        _https: variant.https,
        _stepCount: summary.stepCount,
        _model: summary.lastGeneratorModelUid,
      });
    }
  }

  return chats;
}

function getMessages(chat) {
  if (!chat._port || !chat._csrf) return [];

  const resp = callRpc(chat._port, chat._csrf, 'GetCascadeTrajectory', {
    cascadeId: chat.composerId,
  }, chat._https);
  if (!resp || !resp.trajectory || !resp.trajectory.steps) return [];

  const messages = [];
  for (const step of resp.trajectory.steps) {
    const type = step.type || '';
    const meta = step.metadata || {};

    if (type === 'CORTEX_STEP_TYPE_USER_INPUT' && step.userInput) {
      messages.push({
        role: 'user',
        content: step.userInput.userResponse || step.userInput.items?.map(i => i.text).join('') || '',
      });
    } else if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' && step.plannerResponse) {
      const pr = step.plannerResponse;
      const parts = [];
      if (pr.thinking) parts.push(`[thinking] ${pr.thinking}`);
      // Text content: prefer modifiedResponse > response > textContent
      const text = pr.modifiedResponse || pr.response || pr.textContent || '';
      if (text.trim()) parts.push(text.trim());
      // Tool calls
      const _toolCalls = [];
      if (pr.toolCalls && pr.toolCalls.length > 0) {
        for (const tc of pr.toolCalls) {
          let args = {};
          try { args = tc.argumentsJson ? JSON.parse(tc.argumentsJson) : {}; } catch { args = {}; }
          const argKeys = typeof args === 'object' ? Object.keys(args).join(', ') : '';
          parts.push(`[tool-call: ${tc.name}(${argKeys})]`);
          _toolCalls.push({ name: tc.name, args });
        }
      }
      if (parts.length > 0) {
        messages.push({
          role: 'assistant',
          content: parts.join('\n'),
          _model: meta.generatorModelUid,
          _toolCalls,
        });
      }
    } else if (type === 'CORTEX_STEP_TYPE_TOOL_EXECUTION' && step.toolExecution) {
      const te = step.toolExecution;
      const toolName = te.toolName || te.name || 'tool';
      const result = te.output || te.result || '';
      const preview = typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500);
      messages.push({
        role: 'tool',
        content: `[${toolName}] ${preview}`,
      });
    }
  }
  return messages;
}

module.exports = { name, sources, getChats, getMessages };
