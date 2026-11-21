import type Database from "better-sqlite3"

// The portable data file contains local text. Offline page assets are included
// in the complete ZIP backup; their machine-specific paths cannot be imported.
const tables = [
    "article_folders",
    "folder_articles",
    "article_notes",
    "archive_rules",
    "article_content",
    "article_activity",
] as const
export type LibraryBackup = Partial<
    Record<typeof tables[number], Record<string, unknown>[]>
>

export function exportLibraryData(db: Database.Database): LibraryBackup {
    return Object.fromEntries(
        tables.map(table => [
            table,
            db
                .prepare(`SELECT * FROM ${table}`)
                .all()
                .map((row: Record<string, unknown>) =>
                    table === "article_content"
                        ? { ...row, offlinePath: "" }
                        : row
                ),
        ])
    )
}

export function clearLibraryData(db: Database.Database) {
    db.prepare("DELETE FROM archive_batches").run()
    for (const table of [...tables].reverse())
        db.prepare(`DELETE FROM ${table}`).run()
}

export function restoreLibraryData(
    db: Database.Database,
    data?: LibraryBackup
) {
    if (!data) return
    if (typeof data !== "object" || Array.isArray(data))
        throw new Error("Invalid article library backup.")
    for (const table of tables) {
        const rows = data[table]
        if (rows === undefined) continue
        if (!Array.isArray(rows))
            throw new Error(`Invalid backup table: ${table}`)
        const columns = (
            db.prepare(`PRAGMA table_info(${table})`).all() as {
                name: string
            }[]
        ).map(c => c.name)
        // Parents must exist before children when restoring folder foreign keys.
        const ordered =
            table === "article_folders"
                ? [
                      ...rows.filter(r => r.parentId == null),
                      ...rows.filter(r => r.parentId != null),
                  ]
                : rows
        for (const row of ordered) {
            if (!row || typeof row !== "object" || Array.isArray(row))
                throw new Error("Invalid library row.")
            const keys = columns.filter(key => key in row)
            if (!keys.length) throw new Error("Empty library row.")
            const values = keys.map(key =>
                table === "article_content" && key === "offlinePath"
                    ? ""
                    : typeof row[key] === "boolean"
                    ? Number(row[key])
                    : row[key]
            )
            db.prepare(
                `INSERT INTO ${table} (${keys
                    .map(key => `"${key}"`)
                    .join(",")}) VALUES (${keys.map(() => "?").join(",")})`
            ).run(...values)
        }
    }
}
