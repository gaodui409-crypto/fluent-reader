import type Database from "better-sqlite3"

const MAX_REGEX_PATTERN_LENGTH = 512
const MAX_REGEX_INPUT_LENGTH = 65_536
const REGEX_CACHE_LIMIT = 128

const compiledRegexCache = new Map<string, RegExp | null>()

/**
 * Rejects common catastrophic backtracking shapes (nested unbounded quantifiers
 * or overlapping quantified alternations) before running synchronous RegExp in
 * the main-thread SQLite UDF. Complex archive rules run in archive-worker.ts.
 */
export function isSafeSqliteRegexPattern(pattern: string): boolean {
    if (!pattern || pattern.length > MAX_REGEX_PATTERN_LENGTH) return false
    // Reject backreferences which make JS RegExp matching NP-hard
    if (/\\[1-9]/.test(pattern)) return false
    // Walk groups and detect nested quantifiers such as (a+)+, (.*a){2,}, (a|aa)+
    let depth = 0
    const groupHasQuantifier: boolean[] = []
    let escaped = false
    let inCharClass = false
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]
        if (escaped) {
            escaped = false
            continue
        }
        if (ch === "\\") {
            escaped = true
            continue
        }
        if (inCharClass) {
            if (ch === "]") inCharClass = false
            continue
        }
        if (ch === "[") {
            inCharClass = true
            continue
        }
        if (ch === "(") {
            depth++
            groupHasQuantifier[depth] = false
            continue
        }
        if (ch === ")") {
            const innerQuantified = Boolean(groupHasQuantifier[depth])
            const next = pattern[i + 1]
            const outerQuantified =
                next === "+" || next === "*" || next === "{" || next === "?"
            if (
                innerQuantified &&
                (next === "+" || next === "*" || next === "{")
            ) {
                return false
            }
            if (depth > 0) {
                if (innerQuantified || outerQuantified) {
                    groupHasQuantifier[depth - 1] = true
                }
                depth--
            }
            continue
        }
        if (
            depth > 0 &&
            (ch === "+" ||
                ch === "*" ||
                (ch === "{" && /\d/.test(pattern[i + 1] || "")))
        ) {
            groupHasQuantifier[depth] = true
        }
    }
    return true
}

function getCompiledRegex(pattern: string, flags: string): RegExp | null {
    const key = `${flags}:${pattern}`
    if (compiledRegexCache.has(key)) {
        return compiledRegexCache.get(key) ?? null
    }
    let compiled: RegExp | null = null
    if (isSafeSqliteRegexPattern(pattern)) {
        try {
            compiled = new RegExp(pattern, flags)
        } catch {
            compiled = null
        }
    }
    if (compiledRegexCache.size >= REGEX_CACHE_LIMIT) {
        const oldestKey = compiledRegexCache.keys().next().value
        if (oldestKey !== undefined) compiledRegexCache.delete(oldestKey)
    }
    compiledRegexCache.set(key, compiled)
    return compiled
}

export function registerSafeRegexFunctions(conn: Database.Database) {
    const runMatch = (flags: string) => (pattern: unknown, value: unknown) => {
        if (typeof pattern !== "string" || !pattern) return 0
        const re = getCompiledRegex(pattern, flags)
        if (!re) return 0
        const text = String(value ?? "")
        const bounded =
            text.length > MAX_REGEX_INPUT_LENGTH
                ? text.slice(0, MAX_REGEX_INPUT_LENGTH)
                : text
        try {
            return Number(re.test(bounded))
        } catch {
            return 0
        }
    }
    conn.function("regexp", { deterministic: true }, runMatch(""))
    conn.function("regexpi", { deterministic: true }, runMatch("i"))
}

export function ensureRuntimeSchemaIndexes(conn: Database.Database) {
    conn.exec(`
        CREATE INDEX IF NOT EXISTS ai_cache_item ON ai_cache(itemId);
        CREATE INDEX IF NOT EXISTS ai_cache_kind_item ON ai_cache(kind, itemId);
        CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(createdAt);
        CREATE INDEX IF NOT EXISTS article_folders_parent ON article_folders(parentId);
        CREATE INDEX IF NOT EXISTS items_later_date ON items(readLater, date DESC, _id DESC) WHERE readLater = 1;
    `)
    if (
        conn
            .prepare(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='article_fts'"
            )
            .get()
    ) {
        conn.exec(`
            DROP TRIGGER IF EXISTS items_fts_delete;
            CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
                DELETE FROM article_fts WHERE rowid=old._id;
            END;
            DROP TRIGGER IF EXISTS content_fts_update;
            CREATE TRIGGER content_fts_update AFTER UPDATE OF fullText,offlineText ON article_content BEGIN
                UPDATE article_fts SET fullText=new.fullText, offlineText=new.offlineText WHERE rowid=new.itemId;
                INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes)
                SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'')
                FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id
                WHERE i._id=new.itemId AND NOT EXISTS(SELECT 1 FROM article_fts WHERE rowid=new.itemId);
            END;
            DROP TRIGGER IF EXISTS content_fts_delete;
            CREATE TRIGGER content_fts_delete AFTER DELETE ON article_content BEGIN
                UPDATE article_fts SET fullText='', offlineText='' WHERE rowid=old.itemId AND EXISTS(SELECT 1 FROM items WHERE _id=old.itemId);
            END;
            DROP TRIGGER IF EXISTS notes_fts_update;
            CREATE TRIGGER notes_fts_update AFTER UPDATE OF text ON article_notes BEGIN
                UPDATE article_fts SET notes=new.text WHERE rowid=new.itemId;
                INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes)
                SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'')
                FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id
                WHERE i._id=new.itemId AND NOT EXISTS(SELECT 1 FROM article_fts WHERE rowid=new.itemId);
            END;
            DROP TRIGGER IF EXISTS notes_fts_delete;
            CREATE TRIGGER notes_fts_delete AFTER DELETE ON article_notes BEGIN
                UPDATE article_fts SET notes='' WHERE rowid=old.itemId AND EXISTS(SELECT 1 FROM items WHERE _id=old.itemId);
            END;
        `)
    }
}
