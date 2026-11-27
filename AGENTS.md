# Fluent Reader Personal

## Overview

Fluent Reader Personal is a **customized desktop RSS & knowledge-archive reader** built with **Electron + React 19 + Redux + TypeScript**. It targets Windows (primary Personal edition), macOS, and Linux. The UI combines **Fluent UI v8 (`@fluentui/react`)** and **Fluent UI v9 (`@fluentui/react-components` + `@griffel/react`)** under a unified light/dark theme synchronization layer in `src/components/root.tsx`.

Article, folder, note, activity, full-text, offline, and AI cache data are stored in a local **SQLite** database (`better-sqlite3` in WAL mode in the main process, accessed from the renderer via **drizzle-orm** `sqlite-proxy` `db:execute` and `db:batch`, plus typed `personal:*` IPC handlers). Settings are persisted with **electron-store** (API keys encrypted via Electron `safeStorage`). Full-text extraction uses **@jocmp/mercury-parser** + **@mozilla/readability** + forum floor extraction, offline archiving uses **single-file-core**, and AI summary/translation/daily briefings support any **OpenAI-compatible chat endpoint**.

Formatting is handled by **Prettier** (`.prettierrc.yml`).

## Build & Validate

Always run commands from the repository root.

### Install dependencies

```bash
npm install
```

Run this **before every build** so local `node_modules` stays synchronized with the tracked `package-lock.json` (which is also distributed in the corresponding source archive).

### Build (compile TypeScript via Webpack)

```bash
npm run build
```

This runs `webpack --config ./webpack.config.js`, which produces three webpack compilation entries in `dist/`:
- **Main (`electron-main`)**: `electron.js` (from `src/electron.ts`) + `archive-worker.js` (isolated worker thread from `src/main/archive-worker.ts`)
- **Preload (`electron-preload`)**: `preload.js` (from `src/preload.ts`) + `offline-preload.js` (SingleFile capture preload from `src/offline-preload.ts`)
- **Renderer (`web`)**: `index.js` + `griffel.css` + `index.html` (from `src/index.tsx`)

Build takes ~25–35 seconds and ends with three `compiled successfully` lines.

### Generate DB migrations (only needed when schema changes)

```bash
npm run drizzle:generate
```

Writes SQL migration files to `dist/drizzle/` (`0000` through `0006` are committed and must remain backwards-compatible with existing local `fluent-reader.db` user data).

### Run the app

```bash
npm run electron
# or build + run:
npm run start
```

### Format check, typecheck & auto-format

```bash
npx prettier --check .
npm run typecheck
npm run format
```

### Unit & E2E Tests

Run the fast in-repository unit suite:

```bash
npm run test:unit
```

Maintainer validation scripts (unit + Playwright Electron smoke suites) live in the sibling `../fluent-reader-validation` directory when present (e.g., `weekend-core.cjs`, `stage1-unit.cjs`, `stage4-unit.cjs`, `weekend-unit.cjs`, `retest-archive-unit.cjs`, `retest-ui.cjs`, `stage4-smoke.cjs`).

### Packaging

- Personal Windows build (build + source archive + NSIS + portable zip): `npm run package-personal` (or `npm run package-win-ci` when `dist/` is already built)
- Standard Windows / macOS / Linux: `npm run package-win`, `npm run package-mac`, `npm run package-linux`, `npm run package-mas`

## Project Layout

### Root & Shared Schema Files
| Path | Purpose |
|---|---|
| `package.json` | Dependencies, scripts (`build`, `format`, `typecheck`, `test:unit`, `package-personal`), metadata |
| `webpack.config.js` | Three webpack configs: main (`electron` + `archive-worker`), preload (`preload` + `offline-preload`), renderer (`index`) |
| `electron-builder-personal.yml` | Personal edition Windows packaging config |
| `src/schema-types.ts` | Core enums/types (`ViewType`, `ThemeSettings`, `StoredRule`, responsive layout constants) |
| `src/personal-types.ts` | Personal edition IPC types (`PersonalSettings`, `PersonalStatus`, `AIConfig`, `Briefing`, `OfflineTask`) |
| `src/archive-types.ts` | Filter & archive query/action/folder/note types and literal/regex match helpers |
| `src/source-preferences.ts` | Per-source & per-group preference inheritance (`openTarget`, `fetchMode`, `aiEnabled`, `offlineEnabled`, etc.) |
| `src/reading-preferences.ts` | Per-collection reading preferences (`view`, `openTarget`, `collapseList`, `hoverSummary`) |
| `src/db/schema.ts` | Drizzle SQLite schema (`sources`, `items`, `article_content`, `article_folders`, `folder_articles`, `article_notes`, `archive_rules`, `ai_cache`, `briefings`, etc.) |

### `src/main/` — Electron Main Process Modules
| Path | Description |
|---|---|
| `window.ts` | Main `BrowserWindow` lifecycle, responsive default sizing, webview navigation & shortcut forwarding |
| `settings.ts` | Lazy `electron-store` initialization, corrupt-config recovery & IPC handlers |
| `db.ts` & `sqlite-runtime.ts` | SQLite initialization (WAL mode, `trusted_schema = OFF`), migrations, `html_text` & ReDoS-safe regex UDFs, FTS5 triggers/indexes, `db:execute` & `db:batch` IPC |
| `ipc-guard.ts` & `net-guard.ts` | Main-window `mainFrame` IPC verification and PNA/SSRF + schemeful same-site credential stripping for redirects & subresources |
| `personal.ts` | Central `initPersonal` coordinator registering `personal:*` IPC handlers |
| `personal-preferences.ts` | Personal settings, install-directory path guard, source/group preference overrides, legacy reading preference migration |
| `personal-accounts.ts` | Persistent `persist:sandbox` web login window, parent/subdomain cookie clearing, permission lockdown |
| `service-secrets.ts` | `safeStorage` encryption/decryption for external RSS sync service credentials |
| `error-messages.ts` | Localized human-readable error translator for network, HTTP, AI, offline, and restore failures |
| `domain-queue.ts` | Per-domain rate-limited task queue with `429 Retry-After` backoff and bounded task history |
| `subscriptions.ts` | Feed discovery, redirect resolution, fetch health tracking, and `article_activity` open stats |
| `web-content.ts` | Authenticated direct & hidden-window rendered full-text extraction (`Mercury` + `Readability` + forum floor extractor) |
| `linuxdo.ts` | Discourse / Linux.do public & authenticated category/tag feeds and hourly ranking feed |
| `offline.ts` | SingleFile authenticated offline HTML capture, same-site subresource credential isolation, collision-safe filenames, rollback cleanup |
| `search-index.ts` | Background FTS5 trigram indexer (`article_fts`) and hybrid `<3` / `>=3` character search |
| `backup.ts`, `restore.ts`, `library-backup.ts` | Scheduled/manual ZIP backup, transient-lock-resilient staged startup restore, and `.frdata` portable library backup |
| `ai.ts`, `ai-client.ts`, `ai-briefing.ts` | Encrypted multi-profile OpenAI-compatible client, dual-model routing, code-block-safe bilingual translation, summary/title cache, daily briefings |
| `archive.ts`, `archive-worker.ts`, `archive-matcher.ts`, `archive-folders.ts`, `archive-notes.ts`, `archive-batches.ts` | Whole-library filter & archive engine, warm ReDoS-bounded regex worker, 2-level folders, optimistic-locked notes, and undoable batches |

### `src/components/` — Modular Renderer UI
| Path | Description |
|---|---|
| `root.tsx` | Top-level Fluent UI v9 `FluentProvider` + v8 `ThemeProvider` + `:root` dark/light CSS variable sync |
| `nav.tsx`, `page.tsx`, `list-view.tsx`, `settings.tsx` | Top navigation bar, responsive 3-column docked layout (`>= 1280px`), collapsible split list view, settings shell |
| `menu.tsx` & `menu/` | Docked/drawer sidebar split into `MenuTreeItem`, `useMenuCollections`, `MenuCollectionsSection`, `MenuFoldersAndTagsSection`, `MenuSubscriptionsSection` |
| `context-menu.tsx` & `context-menu/` | Contextual menus split into `ItemContextMenu`, `WebviewContextMenus`, `ViewContextMenu`, `FeedScopeContextMenus`, `shared` |
| `article.tsx` & `article/` | Article reader split into `ArticleToolbar`, `ArticleReaderSurface` (direct JS payload rendering without URL length limits), `articleMenus`, `useArticleShortcuts` |
| `personal/archive-workspace.tsx` & `personal/archive/` | Filter & archive UI split into `ArticleSelectionBar`, `OrganizeDialog`, `ArchiveQueryForm`, `ArchivePreviewList`, `ArchiveActionForm`, `ArchiveRulesSection`, `useOrganizeState` |
| `personal/` | `ai.tsx` (inline summary/translation reader panel + briefings modal), `ai-markdown.tsx` (lightweight safe Markdown renderer), `article-notes.tsx` (collapsible notes & folder drawer), `folders.tsx`, `search.tsx`, `source-settings.tsx`, `subscriptions.tsx`, `linuxdo.tsx`, `reading-controls.tsx` |
| `settings/personal.tsx` & `settings/personal/` | Personal settings tab split into `usePersonalSettings`, `AccountsAndRulesSections`, `ContentAndBackupSections`, `NetworkHealthShortcutsSections` |
| `cards/`, `feeds/`, `utils/` | Card variants (`default-card`, `list-card`, `magazine-card`, `compact-card`), virtualized feeds, `FlatButton` primitives, hooks |

### Important Static Asset Note: `dist/article/`

`dist/article/article.html` enforces strict Content Security Policy and Subresource Integrity (`sha256-...`) for `dist/article/article.js`. Whenever `dist/article/article.js` is modified, recompute its SHA-256 base64 hash and update **both** `<meta http-equiv="Content-Security-Policy">` and `<script integrity="...">` in `dist/article/article.html` (validated automatically by `npm run test:unit` and `build/prepare-personal.cjs`):

```bash
node -e "console.log('sha256-'+require('crypto').createHash('sha256').update(require('fs').readFileSync('dist/article/article.js')).digest('base64'))"
```

## Key Conventions

- All source under `src/` is TypeScript (`.ts`/`.tsx`).
- No semicolons, 4-space indentation (`.prettierrc.yml`). Keep `dist/article/article.js` and `dist/article/article.html` with LF line endings (`.gitattributes`).
- **Browser Support**: Targets Electron's bundled Chromium desktop runtime; Baseline Widely Available and Chromium-shipped Newly Available CSS/Web APIs may be used without external polyfills.
- Use `@griffel/react` (`makeStyles`, `mergeClasses`) for component-scoped styles and CSS variables / Fluent tokens that work in both Light and Dark themes.
- Reusable toolbar buttons use `FlatButton`, `FlatButtonGroup`, and `FlatButtonSeparator` in `src/components/utils/`.

## Validation Checklist

After any code change, always run:
```bash
npm install && npm run build && npx prettier --check . && npm run test:unit
```
All commands must succeed cleanly. If Prettier reports formatting differences, run `npm run format` and re-verify.
