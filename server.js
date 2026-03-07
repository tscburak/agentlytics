const express = require('express');
const path = require('path');
const cache = require('./cache');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// API endpoints — all reads from SQLite cache
// ============================================================

app.get('/api/overview', (req, res) => {
  try {
    const opts = { editor: req.query.editor || null };
    res.json(cache.getCachedOverview(opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/daily-activity', (req, res) => {
  try {
    const opts = { editor: req.query.editor || null };
    res.json(cache.getCachedDailyActivity(opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats', (req, res) => {
  try {
    const opts = {
      editor: req.query.editor || null,
      folder: req.query.folder || null,
      named: req.query.named !== 'false',
      limit: req.query.limit ? parseInt(req.query.limit) : 200,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    };
    const total = cache.countCachedChats(opts);
    const rows = cache.getCachedChats(opts);
    res.json({
      total,
      chats: rows.map(c => ({
        id: c.id,
        source: c.source,
        name: c.name,
        mode: c.mode,
        folder: c.folder,
        createdAt: c.created_at,
        lastUpdatedAt: c.last_updated_at,
        encrypted: !!c.encrypted,
        bubbleCount: c.bubble_count,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/:id', (req, res) => {
  try {
    const result = cache.getCachedChat(req.params.id);
    if (!result) return res.status(404).json({ error: 'Chat not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    res.json(cache.getCachedProjects());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/deep-analytics', (req, res) => {
  try {
    const opts = {
      editor: req.query.editor || null,
      folder: req.query.folder || null,
      limit: Math.min(parseInt(req.query.limit) || 500, 5000),
    };
    res.json(cache.getCachedDeepAnalytics(opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tool-calls', (req, res) => {
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: 'name query param required' });
    const opts = {
      limit: Math.min(parseInt(req.query.limit) || 200, 1000),
      folder: req.query.folder || null,
    };
    res.json(cache.getCachedToolCalls(name, opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/refetch', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  try {
    const result = cache.resetAndRescan((progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true, total: result.total, analyzed: result.analyzed })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
