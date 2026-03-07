#!/usr/bin/env node

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cache = require('./cache');

const PORT = 4637;
const noCache = process.argv.includes('--no-cache');

console.log('');
console.log(chalk.bold('  ⚡ Agentlytics'));
console.log(chalk.dim('  Comprehensive analytics for your AI coding agents'));
console.log('');

// Wipe cache if --no-cache flag is passed
if (noCache) {
  const cacheDb = path.join(os.homedir(), '.agentlytics', 'cache.db');
  if (fs.existsSync(cacheDb)) {
    fs.unlinkSync(cacheDb);
    console.log(chalk.yellow('  ⟳ Cache cleared (--no-cache)'));
  }
}

// Initialize cache DB
console.log(chalk.dim('  Initializing cache database...'));
cache.initDb();

// Scan all editors and populate cache
console.log(chalk.dim('  Scanning editors: Cursor, Windsurf, Claude Code, VS Code, Zed, Antigravity, OpenCode'));
const startTime = Date.now();
const result = cache.scanAll((progress) => {
  process.stdout.write(chalk.dim(`\r  Scanning: ${progress.scanned}/${progress.total} chats (${progress.analyzed} analyzed, ${progress.skipped} cached)`));
});
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('');
console.log(chalk.green(`  ✓ Cache ready: ${result.total} chats, ${result.analyzed} analyzed, ${result.skipped} cached (${elapsed}s)`));
console.log('');

// Start server
const app = require('./server');
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(chalk.green(`  ✓ Dashboard ready at ${chalk.bold.white(url)}`));
  console.log(chalk.dim(`  Press Ctrl+C to stop\n`));

  // Auto-open browser
  const open = require('open');
  open(url).catch(() => {});
});
