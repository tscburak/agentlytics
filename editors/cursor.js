const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME = os.homedir();
const CURSOR_CHATS_DIR = path.join(HOME, '.cursor', 'chats');
const WORKSPACE_STORAGE_DIR = path.join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
const GLOBAL_STORAGE_DB = path.join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');

// ============================================================
// Source 1: ~/.cursor/chats/<hash>/<chatId>/store.db (agent KV)
// ============================================================

function getAgentStoreChats() {
  const results = [];
  if (!fs.existsSync(CURSOR_CHATS_DIR)) return results;

  for (const workspace of fs.readdirSync(CURSOR_CHATS_DIR)) {
    const wsDir = path.join(CURSOR_CHATS_DIR, workspace);
    if (!fs.statSync(wsDir).isDirectory()) continue;
    for (const chat of fs.readdirSync(wsDir)) {
      const dbPath = path.join(wsDir, chat, 'store.db');
      if (fs.existsSync(dbPath)) {
        results.push({ workspace, chatId: chat, dbPath });
      }
    }
  }
  return results;
}

function hexToString(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return str;
}

function readStoreMeta(db) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('0');
  if (!row) return null;
  const hex = typeof row.value === 'string' ? row.value : Buffer.from(row.value).toString('hex');
  try {
    return JSON.parse(hexToString(hex));
  } catch {
    try { return JSON.parse(row.value); } catch { return null; }
  }
}

function parseTreeBlob(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const messageRefs = [];
  const childRefs = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 34 > buf.length) break;
    const tag = buf[offset];
    const len = buf[offset + 1];
    if (len !== 0x20) break;
    const hash = buf.slice(offset + 2, offset + 2 + 32).toString('hex');
    if (tag === 0x0a) messageRefs.push(hash);
    else if (tag === 0x12) childRefs.push(hash);
    else break;
    offset += 2 + 32;
  }
  return { messageRefs, childRefs };
}

function collectStoreMessages(db, rootBlobId) {
  const allMessages = [];
  const visited = new Set();
  function walk(blobId) {
    if (visited.has(blobId)) return;
    visited.add(blobId);
    const row = db.prepare('SELECT data FROM blobs WHERE id = ?').get(blobId);
    if (!row) return;
    const data = row.data;
    try {
      const json = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString('utf-8'));
      if (json && json.role) { allMessages.push(json); return; }
    } catch { /* tree blob */ }
    const { messageRefs, childRefs } = parseTreeBlob(data);
    for (const ref of messageRefs) walk(ref);
    for (const ref of childRefs) walk(ref);
  }
  walk(rootBlobId);
  return allMessages;
}

// ============================================================
// Source 2: workspaceStorage + globalStorage (composer bubbles)
// ============================================================

function getWorkspaceMap() {
  const map = [];
  if (!fs.existsSync(WORKSPACE_STORAGE_DIR)) return map;
  for (const hash of fs.readdirSync(WORKSPACE_STORAGE_DIR)) {
    const dir = path.join(WORKSPACE_STORAGE_DIR, hash);
    const wsJson = path.join(dir, 'workspace.json');
    const stateDb = path.join(dir, 'state.vscdb');
    if (!fs.existsSync(wsJson) || !fs.existsSync(stateDb)) continue;
    try {
      const ws = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
      const folder = (ws.folder || '').replace('file://', '');
      map.push({ hash, folder, stateDb });
    } catch { /* skip */ }
  }
  return map;
}

function getComposerHeaders(stateDbPath) {
  try {
    const db = new Database(stateDbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerData'").get();
    db.close();
    if (!row) return [];
    const data = JSON.parse(row.value);
    return (data.allComposers || []).map((c) => ({
      composerId: c.composerId,
      name: c.name || null,
      createdAt: c.createdAt || null,
      lastUpdatedAt: c.lastUpdatedAt || null,
      mode: c.unifiedMode || c.forceMode || 'unknown',
      isAgentic: c.unifiedMode === 'agent',
    }));
  } catch { return []; }
}

function getComposerBubbles(globalDb, composerId) {
  const prefix = `bubbleId:${composerId}:`;
  const rows = globalDb.prepare(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key"
  ).all(prefix + '%');

  const bubbles = [];
  for (const row of rows) {
    try {
      const obj = JSON.parse(row.value);
      bubbles.push(obj);
    } catch { /* binary blob, skip */ }
  }
  return bubbles;
}

function bubblesToMessages(bubbles) {
  const messages = [];
  for (const b of bubbles) {
    const type = b.type; // 1=user, 2=assistant
    if (type === 1) {
      const text = b.text || '';
      if (text) {
        messages.push({ role: 'user', content: text });
      }
    } else if (type === 2) {
      const parts = [];
      // Thinking block
      const thinking = b.thinking;
      if (thinking && thinking.text) {
        parts.push({ type: 'reasoning', text: thinking.text });
      }
      // Tool calls
      const tfd = b.toolFormerData;
      if (tfd && tfd.name) {
        let args = {};
        try { args = typeof tfd.rawArgs === 'string' ? JSON.parse(tfd.rawArgs) : (tfd.rawArgs || {}); } catch { args = {}; }
        parts.push({
          type: 'tool-call',
          toolName: tfd.name,
          toolCallId: tfd.toolCallId || '',
          args,
          status: tfd.status || '',
          userDecision: tfd.userDecision || '',
        });
        if (tfd.result) {
          const resultText = typeof tfd.result === 'string' ? tfd.result
            : (tfd.result.diff ? JSON.stringify(tfd.result.diff).substring(0, 500) : JSON.stringify(tfd.result).substring(0, 500));
          parts.push({
            type: 'tool-result',
            toolName: tfd.name,
            result: resultText,
            userDecision: tfd.userDecision || '',
          });
        }
      }
      if (b.text) {
        parts.unshift({ type: 'text', text: b.text });
      }
      if (b.codeBlocks && b.codeBlocks.length > 0) {
        for (const cb of b.codeBlocks) {
          const filePath = cb.uri ? cb.uri.path : '';
          if (filePath) {
            parts.push({ type: 'text', text: `[file: ${filePath}]` });
          }
        }
      }
      if (parts.length > 0) {
        messages.push({ role: 'assistant', content: parts });
      }
    }
  }
  return messages;
}

// ============================================================
// Adapter interface
// ============================================================

const name = 'cursor';

function getChats() {
  const chats = [];

  // Source 1: ~/.cursor/chats store.db
  for (const { workspace, chatId, dbPath } of getAgentStoreChats()) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const meta = readStoreMeta(db);
      db.close();
      if (meta) {
        chats.push({
          source: 'cursor',
          composerId: chatId,
          name: meta.name || null,
          createdAt: meta.createdAt || null,
          folder: null,
          _dbPath: dbPath,
          _rootBlobId: meta.latestRootBlobId,
          _type: 'agent-store',
        });
      }
    } catch { /* skip */ }
  }

  // Source 2: workspaceStorage composers
  let globalDb = null;
  try { globalDb = new Database(GLOBAL_STORAGE_DB, { readonly: true }); } catch { /* no global db */ }

  for (const { hash, folder, stateDb } of getWorkspaceMap()) {
    const headers = getComposerHeaders(stateDb);
    for (const h of headers) {
      let bubbleCount = 0;
      if (globalDb) {
        try {
          const countRow = globalDb.prepare(
            "SELECT count(*) as cnt FROM cursorDiskKV WHERE key LIKE ?"
          ).get(`bubbleId:${h.composerId}:%`);
          bubbleCount = countRow ? countRow.cnt : 0;
        } catch { /* skip */ }
      }
      chats.push({
        source: 'cursor',
        composerId: h.composerId,
        name: h.name || null,
        createdAt: h.createdAt || null,
        lastUpdatedAt: h.lastUpdatedAt || null,
        mode: h.mode,
        folder,
        bubbleCount,
        _type: 'workspace',
      });
    }
  }

  if (globalDb) globalDb.close();
  return chats;
}

function getMessages(chat) {
  if (chat._type === 'agent-store') {
    const db = new Database(chat._dbPath, { readonly: true });
    const msgs = collectStoreMessages(db, chat._rootBlobId);
    db.close();
    return msgs;
  }

  let globalDb;
  try { globalDb = new Database(GLOBAL_STORAGE_DB, { readonly: true }); } catch { return []; }
  const bubbles = getComposerBubbles(globalDb, chat.composerId);
  globalDb.close();
  return bubblesToMessages(bubbles);
}

module.exports = { name, getChats, getMessages };
