const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const assert = require("node:assert/strict")
const ts = require("typescript")
const Database = require("better-sqlite3")
const { drizzle } = require("drizzle-orm/better-sqlite3")
const { migrate } = require("drizzle-orm/better-sqlite3/migrator")
const { parseHTML } = require("linkedom")

const appRoot = path.resolve(__dirname, "..")

for (const ext of [".ts", ".tsx"]) {
    require.extensions[ext] = (mod, filename) => {
        const source = fs.readFileSync(filename, "utf8")
        const compiled = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
                esModuleInterop: true,
            },
        }).outputText
        mod._compile(compiled, filename)
    }
}

function createTestDb() {
    const sqlite = new Database(":memory:")
    sqlite.pragma("foreign_keys = ON")
    sqlite.function("html_text", html => {
        try {
            return parseHTML(
                "<!doctype html><html><body>" +
                    String(html || "") +
                    "</body></html>"
            ).document.body.textContent
        } catch {
            return String(html || "")
        }
    })
    migrate(drizzle(sqlite), {
        migrationsFolder: path.join(appRoot, "dist/drizzle"),
    })
    return sqlite
}

async function main() {
    const passed = []

    // 1. Error humanizer preserves HTTP/AI status codes while translating to clear Chinese
    {
        const { humanizePersonalError } = require(path.join(
            appRoot,
            "src/main/error-messages.ts"
        ))
        const ai401 = humanizePersonalError(
            "AI request failed: 401 denied",
            "zh-CN"
        )
        assert.match(ai401, /401/)
        assert.match(ai401, /密钥/)
        const http503 = humanizePersonalError("HTTP 503", "zh-CN")
        assert.match(http503, /503/)
        const en = humanizePersonalError("Article was not found.", "en-US")
        assert.equal(en, "Article was not found.")
        passed.push(
            "humanizePersonalError translates zh-CN cleanly and keeps status codes"
        )
    }

    // 2. DomainQueue normalizes hosts, tracks summary, and bounds maps
    {
        const { DomainQueue, normalizeSiteHost } = require(path.join(
            appRoot,
            "src/main/domain-queue.ts"
        ))
        assert.equal(
            normalizeSiteHost("https://Blog.Example.com/feed"),
            "blog.example.com"
        )
        assert.equal(normalizeSiteHost("Example.com"), "example.com")
        const queue = new DomainQueue(() => ({
            domainInterval: 0,
            concurrency: 2,
        }))
        const res = await queue.add(
            "https://example.com/a",
            "fullText",
            async () => "ok"
        )
        assert.equal(res, "ok")
        assert.equal(queue.summary().running, 0)
        passed.push("DomainQueue host normalization and summary")
    }

    // 3. ArchiveMatcher warm worker + ReDoS timeout recovery
    {
        const { ArchiveMatcher } = require(path.join(
            appRoot,
            "src/main/archive-matcher.ts"
        ))
        const { emptyArchiveQuery } = require(path.join(
            appRoot,
            "src/archive-types.ts"
        ))
        const matcher = new ArchiveMatcher()
        try {
            const rows = [
                {
                    id: 1,
                    title: "Rust async runtime",
                    body: "Tokio guide",
                    author: "Alice",
                    link: "https://a.example/1",
                    source: "Tech",
                    date: 1000,
                },
                {
                    id: 2,
                    title: "a".repeat(42) + "!",
                    body: "other",
                    author: "Bob",
                    link: "https://a.example/2",
                    source: "Tech",
                    date: 2000,
                },
            ]
            const hit = await matcher.match(
                {
                    ...emptyArchiveQuery,
                    regex: "Rust\\s+async",
                    field: "title",
                },
                rows,
                true
            )
            assert.equal(hit.length, 1)
            assert.equal(hit[0].id, 1)

            // Pathological backtracking regex must time out and allow subsequent jobs to succeed
            await assert.rejects(
                () =>
                    matcher.match(
                        {
                            ...emptyArchiveQuery,
                            regex: "(a+)+$",
                            field: "title",
                        },
                        [rows[1]],
                        false
                    ),
                /超时/
            )

            const recovered = await matcher.match(
                { ...emptyArchiveQuery, regex: "Tokio", field: "body" },
                rows,
                false
            )
            assert.equal(recovered.length, 1)
            assert.equal(recovered[0].id, 1)
        } finally {
            matcher.terminate()
        }
        passed.push("ArchiveMatcher warm worker + ReDoS timeout recovery")
    }

    // 4. AI titles() batch query + resilient briefings() + deleteBriefing()
    {
        const sqlite = createTestDb()
        sqlite
            .prepare(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://ex.com/rss','Ex',0)"
            )
            .run()
        sqlite
            .prepare(
                "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet) VALUES(10,1,'Hello','https://ex.com/1',1000,1000,'<p>Body</p>','Body')"
            )
            .run()
        sqlite
            .prepare(
                "INSERT INTO ai_cache(key,itemId,kind,result,tokens,createdAt) VALUES('test-key',10,'title','你好',12,1000)"
            )
            .run()
        sqlite
            .prepare(
                "INSERT INTO briefings(id,createdAt,content,tokens) VALUES(1,1000,'{broken-json',10),(2,2000,?,25)"
            )
            .run(
                JSON.stringify([
                    {
                        topic: "动态",
                        entries: [
                            {
                                id: 10,
                                title: "Hello",
                                summary: "Summary",
                                link: "https://ex.com/1",
                            },
                        ],
                    },
                ])
            )

        const Module = require("node:module")
        const origLoad = Module._load
        Module._load = function (request, parent, isMain) {
            if (request === "electron") {
                return {
                    safeStorage: {
                        isEncryptionAvailable: () => true,
                        encryptString: s => Buffer.from(s, "utf8"),
                        decryptString: b => b.toString("utf8"),
                    },
                }
            }
            return origLoad.apply(this, arguments)
        }
        try {
            const { AI } = require(path.join(appRoot, "src/main/ai.ts"))
            const storeData = {
                ai: {
                    baseURL: "http://127.0.0.1:11434/v1",
                    model: "m",
                    targetLanguage: "简体中文",
                    dailyBriefing: false,
                    briefingHour: 8,
                    encryptedKey: "",
                    lastBriefingDay: "",
                },
            }
            const store = {
                get: (k, d) => storeData[k] ?? d,
                set: (k, v) => {
                    storeData[k] = v
                },
            }
            const ai = new AI(
                sqlite,
                store,
                { add: (_u, _l, fn) => fn() },
                () => ({
                    aiEnabled: true,
                    autoTranslateTitle: false,
                    autoSummary: false,
                }),
                () => {}
            )
            const list = ai.briefings()
            assert.equal(list.length, 1)
            assert.equal(list[0].id, 2)
            assert.deepEqual(ai.articleState(10), {})
            ai.deleteBriefing(2)
            assert.equal(ai.briefings().length, 0)
        } finally {
            Module._load = origLoad
            sqlite.close()
        }
        passed.push(
            "AI resilient briefings parsing, articleState, and deleteBriefing"
        )
    }

    // 5. collectionKey preserves folder:*, s-*, g-*, library:, later:, starred:, tag:*
    {
        const { collectionKey } = require(path.join(
            appRoot,
            "src/reading-preferences.ts"
        ))
        assert.equal(collectionKey("folder:12"), "folder:12")
        assert.equal(collectionKey("library:"), "library:")
        assert.equal(collectionKey("s-5"), "s-5")
        assert.equal(collectionKey("g-3"), "g-3")
        assert.equal(collectionKey("later:"), "later:")
        assert.equal(collectionKey(""), "")
        passed.push(
            "collectionKey validates all collection reading preference keys"
        )
    }

    // 6. Temporary directory sanity for SearchIndex full rebuild
    {
        const sqlite = createTestDb()
        const { SearchIndex } = require(path.join(
            appRoot,
            "src/main/search-index.ts"
        ))
        sqlite
            .prepare(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://ex.com/rss','SourceA',0)"
            )
            .run()
        sqlite
            .prepare(
                "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet) VALUES(1,1,'中文检索标题','https://ex.com/1',1000,1000,'<p>支持短词 AI 搜索</p>','摘要')"
            )
            .run()
        const idx = new SearchIndex(sqlite)
        idx.start(true)
        await new Promise(r => setTimeout(r, 80))
        assert.equal(idx.search("AI").length, 1)
        assert.equal(idx.search("中文检索").length, 1)
        idx.stop()
        sqlite.close()
        passed.push("SearchIndex full rebuild + <3 char & >=3 char FTS search")
    }

    // 7. applyPendingRestore retires failed staged restore so subsequent launches preserve new data
    {
        const { applyPendingRestore, sha256 } = require(path.join(
            appRoot,
            "src/main/restore.ts"
        ))
        const tmp = fs.mkdtempSync(
            path.join(os.tmpdir(), "fluent-restore-unit-")
        )
        try {
            const liveDb = new Database(path.join(tmp, "fluent-reader.db"))
            liveDb.exec("CREATE TABLE t(v TEXT); INSERT INTO t VALUES('v1');")
            liveDb.close()
            fs.writeFileSync(path.join(tmp, "config.json"), '{"step":1}')

            const pending = path.join(tmp, "pending-restore")
            fs.mkdirSync(path.join(pending, "offline"), { recursive: true })
            const badDbBytes = fs.readFileSync(
                path.join(tmp, "fluent-reader.db")
            )
            // Valid DB without article_content table -> triggers rollback inside offline restore transaction
            fs.writeFileSync(path.join(pending, "fluent-reader.db"), badDbBytes)
            fs.writeFileSync(path.join(pending, "config.json"), '{"step":999}')
            fs.writeFileSync(path.join(pending, "offline/1.html"), "<p>off</p>")
            fs.writeFileSync(
                path.join(pending, "manifest.json"),
                JSON.stringify({
                    hashes: {
                        "config.json": sha256('{"step":999}'),
                        "fluent-reader.db": sha256(badDbBytes),
                        "offline/1.html": sha256("<p>off</p>"),
                    },
                    offline: [
                        {
                            itemId: 1,
                            entry: "offline/1.html",
                            relative: ["src", "2026-01-01", "a.html"],
                        },
                    ],
                })
            )

            assert.throws(() => applyPendingRestore(tmp))
            assert.equal(
                fs.existsSync(path.join(pending, "manifest.json")),
                false
            )
            // Simulate user writing new data after the aborted restore, then restarting the app
            fs.writeFileSync(path.join(tmp, "config.json"), '{"step":2}')
            applyPendingRestore(tmp)
            assert.equal(
                fs.readFileSync(path.join(tmp, "config.json"), "utf8"),
                '{"step":2}'
            )
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true })
        }
        passed.push(
            "applyPendingRestore retires failed staged restore after rollback"
        )
    }

    console.log(`PASS (${passed.length}/${passed.length}):`)
    for (const item of passed) console.log(" -", item)
}

main().catch(err => {
    console.error(err)
    process.exitCode = 1
})
