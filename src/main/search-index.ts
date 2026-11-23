import type Database from "better-sqlite3"
import type { IndexProgress, SearchHit } from "../personal-types"

export class SearchIndex {
    progress: IndexProgress = { indexed: 0, total: 0, running: false }
    private stopped = false
    private loopActive = false

    constructor(private sqlite: Database.Database) {}

    start(reset = false) {
        this.stopped = false
        if (reset) {
            try {
                this.sqlite.prepare("DELETE FROM article_fts").run()
            } catch (error) {
                this.progress = {
                    ...this.progress,
                    running: false,
                    error: String(error),
                }
                return
            }
        }
        if (this.loopActive) return
        this.loopActive = true
        const total = (
            this.sqlite.prepare("SELECT count(*) AS n FROM items").get() as {
                n: number
            }
        ).n
        const initialIndexed = (
            this.sqlite
                .prepare("SELECT count(*) AS n FROM article_fts")
                .get() as { n: number }
        ).n
        this.progress = {
            indexed: initialIndexed,
            total,
            running: initialIndexed < total,
        }
        const batch = () => {
            if (this.stopped) {
                this.loopActive = false
                this.progress = { ...this.progress, running: false }
                return
            }
            try {
                const rows = this.sqlite
                    .prepare(
                        "SELECT i._id FROM items i LEFT JOIN article_fts f ON f.rowid=i._id WHERE f.rowid IS NULL LIMIT 100"
                    )
                    .all() as { _id: number }[]
                if (rows.length > 0) {
                    const insert = this.sqlite
                        .prepare(`INSERT OR REPLACE INTO article_fts(rowid,title,body,fullText,offlineText,notes)
                        SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'')
                        FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=?`)
                    this.sqlite.transaction(() =>
                        rows.forEach(row => insert.run(row._id))
                    )()
                }
                const running = rows.length === 100
                const currentTotal = (
                    this.sqlite
                        .prepare("SELECT count(*) AS n FROM items")
                        .get() as { n: number }
                ).n
                const currentIndexed = running
                    ? Math.min(
                          currentTotal,
                          this.progress.indexed + rows.length
                      )
                    : (
                          this.sqlite
                              .prepare("SELECT count(*) AS n FROM article_fts")
                              .get() as { n: number }
                      ).n
                this.progress = {
                    indexed: currentIndexed,
                    total: currentTotal,
                    running,
                }
                if (running) setTimeout(batch, 10)
                else this.loopActive = false
            } catch (error) {
                this.loopActive = false
                this.progress = {
                    ...this.progress,
                    running: false,
                    error: String(error),
                }
            }
        }
        setTimeout(batch, 0)
    }

    stop() {
        this.stopped = true
    }

    search(query: string, offset = 0): SearchHit[] {
        const terms = query
            .trim()
            .slice(0, 500)
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 12)
        if (!terms.length) return []
        // FTS5 trigram intentionally has no matches for <3 code points. Keep
        // those terms as literal substring predicates, including one/two Hanzi.
        const long = terms.filter(term => [...term].length >= 3)
        const short = terms.filter(term => [...term].length < 3)
        const conditions: string[] = []
        const params: unknown[] = []
        if (long.length) {
            conditions.push("article_fts MATCH ?")
            params.push(
                long
                    .map(term => '"' + term.replace(/"/g, '""') + '"')
                    .join(" AND ")
            )
        }
        const columns = ["title", "body", "fullText", "offlineText", "notes"]
        for (const term of short) {
            const escaped = "%" + term.replace(/[\\%_]/g, "\\$&") + "%"
            conditions.push(
                "(" +
                    columns
                        .map(col => `coalesce(f.${col},'') LIKE ? ESCAPE '\\'`)
                        .join(" OR ") +
                    ")"
            )
            for (let i = 0; i < columns.length; i++) params.push(escaped)
        }
        const rankParams: string[] = []
        const rank = long.length
            ? "bm25(article_fts,6,1,1,1,2)"
            : "-(" +
              short
                  .map(term =>
                      columns
                          .map((field, index) => {
                              rankParams.push(term)
                              return `CASE WHEN instr(lower(coalesce(f.${field},'')),lower(?))>0 THEN ${
                                  index === 0 ? 6 : 1
                              } ELSE 0 END`
                          })
                          .join(" + ")
                  )
                  .join(" + ") +
              ")"
        const rows = this.sqlite
            .prepare(
                `SELECT f.rowid AS id, f.title, f.body, f.fullText, f.offlineText, coalesce(f.notes,'') AS notes, s.name AS source, i.date AS date, ${rank} AS rank
            FROM article_fts f JOIN items i ON i._id=f.rowid JOIN sources s ON s.sid=i.source
            WHERE ${conditions.join(
                " AND "
            )} ORDER BY rank, i.date DESC LIMIT 50 OFFSET ?`
            )
            .all(
                ...rankParams,
                ...params,
                Math.max(0, Math.floor(offset))
            ) as (SearchHit & {
            body: string
            notes: string
            fullText: string
            offlineText: string
            date: number
        })[]
        const lowerTerms = terms.map(t => t.toLocaleLowerCase())
        return rows.map(
            ({
                id,
                title,
                body,
                fullText,
                offlineText,
                notes,
                source,
                rank,
                date,
            }) => {
                const text =
                    [notes, body, fullText, offlineText].find(value => {
                        if (!value) return false
                        const lower = value.toLocaleLowerCase()
                        return lowerTerms.some(term => lower.includes(term))
                    }) ||
                    body ||
                    ""
                const lowerText = text.toLocaleLowerCase()
                const positions = lowerTerms
                    .map(term => lowerText.indexOf(term))
                    .filter(pos => pos >= 0)
                const start = Math.max(
                    0,
                    (positions.length ? Math.min(...positions) : 0) - 45
                )
                return {
                    id,
                    title,
                    source,
                    rank,
                    date: Number(date) || 0,
                    excerpt:
                        (start ? "…" : "") +
                        text.slice(start, start + 240) +
                        (text.length > start + 240 ? "…" : ""),
                }
            }
        )
    }
}
