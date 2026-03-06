# ai-chat-cli

CLI tool to browse, search, and export AI IDE chat history across **Cursor** and **Windsurf**.

## Install

```bash
npm install
npm link   # optional: makes `ai-chat` available globally
```

## Usage

```bash
# List all chats (named/non-empty by default)
node index.js list
node index.js list --limit 10
node index.js list --editor cursor       # filter by editor
node index.js list --editor windsurf     # filter by editor
node index.js list --folder teknasyon    # filter by project path
node index.js list --all                 # include empty/unnamed chats

# View a conversation (use ID prefix from list output)
node index.js view 75ce5675
node index.js view 75ce5675 --system     # include system prompts
node index.js view 75ce5675 --tools      # include tool calls/results with details
node index.js view 75ce5675 --reasoning  # include thinking blocks

# Export to Markdown
node index.js export 75ce5675
node index.js export 75ce5675 -o chat.md --system --tools

# Search chats by name or folder
node index.js search "refactor"
node index.js search "metrics" --deep    # also search message content (slower)
node index.js search "metrics" --editor cursor
```

## Architecture

```
editors/
  base.js       — shared formatting utilities and adapter contract
  cursor.js     — Cursor IDE adapter (reads store.db + workspaceStorage + globalStorage)
  windsurf.js   — Windsurf adapter (reads encrypted cascade .pb sessions + workspace mapping)
  index.js      — aggregates all editor adapters into a unified interface
index.js        — CLI commands (list, view, export, search)
```

## Supported Editors

### Cursor (full support)

Cursor stores chat data in **two locations** on macOS:

- **Agent Store** (`~/.cursor/chats/<hash>/<chatId>/store.db`)
  - SQLite with `meta` (hex-encoded JSON) and `blobs` (content-addressed SHA-256)
  - Tree blobs are protobuf-encoded; message blobs are JSON `{role, content}`
- **Workspace + Global Storage** (`~/Library/Application Support/Cursor/User/`)
  - `workspaceStorage/<hash>/state.vscdb` — composer headers via `composer.composerData`
  - `globalStorage/state.vscdb` — messages via `bubbleId:<composerId>:<msgId>` in `cursorDiskKV`

### Windsurf (metadata only — messages encrypted)

Windsurf stores Cascade sessions as encrypted `.pb` files:

- **Cascade sessions**: `~/.codeium/{windsurf,windsurf-next}/cascade/<uuid>.pb`
  - Encrypted (8.0-bit entropy) — file metadata (dates, sizes) is available but content is not readable
- **Workspace mapping**: `~/Library/Application Support/{Windsurf,Windsurf - Next}/User/workspaceStorage/`
  - Same VSCode-style `workspace.json` → folder mapping

Windsurf chats appear in listings with a 🔒 indicator. Viewing shows session metadata only.

## Adding a New Editor

Create `editors/<name>.js` exporting:
- `name` — string identifier
- `getChats()` — returns `[{ source, composerId, name, createdAt, lastUpdatedAt, mode, folder, encrypted }]`
- `getMessages(chat)` — returns `[{ role, content }]`

Then register it in `editors/index.js`.

## License

ISC
