import type Database from "better-sqlite3"
import type { IndexProgress, SearchHit } from "../personal-types"

export class SearchIndex {
    progress: IndexProgress = { indexed: 0, total: 0, running: false }
    private stopped = false

    constructor(private sqlite: Database.Database) {}

    start() {
        this.stopped = false
        this.progress.running = true
        const batch = () => {
            if (this.stopped) return
            try {
                const rows = this.sqlite
                    .prepare(
                        "SELECT i._id FROM items i LEFT JOIN article_fts f ON f.rowid=i._id WHERE f.rowid IS NULL LIMIT 100"
                    )
                    .all() as { _id: number }[]
                const insert = this.sqlite
                    .prepare(`INSERT OR REPLACE INTO article_fts(rowid,title,body,fullText,offlineText,notes)
                    SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'')
                    FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=?`)
                this.sqlite.transaction(() =>
                    rows.forEach(row => insert.run(row._id))
                )()
                this.progress = {
                    indexed: (
                        this.sqlite
                            .prepare("SELECT count(*) AS n FROM article_fts")
                            .get() as { n: number }
                    ).n,
                    total: (
                        this.sqlite
                            .prepare("SELECT count(*) AS n FROM items")
                            .get() as { n: number }
                    ).n,
                    running: rows.length === 100,
                }
                if (this.progress.running) setTimeout(batch, 10)
            } catch (error) {
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
        for (const term of short) {
            conditions.push(
                "(f.title || char(10) || f.body || char(10) || f.fullText || char(10) || f.offlineText || char(10) || coalesce(f.notes,'')) LIKE ? ESCAPE '\\'"
            )
            params.push("%" + term.replace(/[\\%_]/g, "\\$&") + "%")
        }
        const rankParams: string[] = []
        const rank = long.length
            ? "bm25(article_fts,6,1,1,1,2)"
            : "-(" +
              short
                  .map(term => {
                      return [
                          "title",
                          "body",
                          "fullText",
                          "offlineText",
                          "notes",
                      ]
                          .map((field, index) => {
                              rankParams.push(term)
                              return `CASE WHEN instr(lower(f.${field}),lower(?))>0 THEN ${
                                  index === 0 ? 6 : 1
                              } ELSE 0 END`
                          })
                          .join(" + ")
                  })
                  .join(" + ") +
              ")"
        const rows = this.sqlite
            .prepare(
                `SELECT f.rowid AS id, f.title, f.body, f.fullText, f.offlineText, coalesce(f.notes,'') AS notes, s.name AS source, ${rank} AS rank
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
        })[]
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
            }) => {
                const text =
                    [notes, body, fullText, offlineText].find(value =>
                        terms.some(term =>
                            value
                                .toLocaleLowerCase()
                                .includes(term.toLocaleLowerCase())
                        )
                    ) || body
                const positions = terms
                    .map(term =>
                        text
                            .toLocaleLowerCase()
                            .indexOf(term.toLocaleLowerCase())
                    )
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
                    excerpt:
                        (start ? "…" : "") + text.slice(start, start + 250),
                }
            }
        )
    }
}
