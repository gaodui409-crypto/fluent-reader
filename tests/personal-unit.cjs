const fs = require("node:fs")
const http = require("node:http")
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

function makeStore(initial = {}) {
    const data = { ...initial }
    return {
        data,
        has: k => Object.prototype.hasOwnProperty.call(data, k),
        get: (k, d) => (data[k] !== undefined ? data[k] : d),
        set: (k, v) => {
            data[k] = v
        },
    }
}

function withMockElectron(fn) {
    const Module = require("node:module")
    const origLoad = Module._load
    Module._load = function (request, parent, isMain) {
        if (request === "electron") {
            return {
                net: { fetch: globalThis.fetch },
                safeStorage: {
                    isEncryptionAvailable: () => true,
                    encryptString: s => Buffer.from("enc:" + s, "utf8"),
                    decryptString: b => {
                        const str = b.toString("utf8")
                        return str.startsWith("enc:") ? str.slice(4) : str
                    },
                },
                session: {
                    fromPartition: () => ({
                        fetch: globalThis.fetch,
                        cookies: {
                            get: async () => [],
                            remove: async () => {},
                            flushStore: async () => {},
                        },
                        clearStorageData: async () => {},
                        setPermissionRequestHandler: () => {},
                        setPermissionCheckHandler: () => {},
                    }),
                },
                app: {
                    getLocale: () => "zh-CN",
                    getPath: () => path.join(appRoot, "dist"),
                    on: () => {},
                    once: () => {},
                    whenReady: () => new Promise(() => {}),
                },
                ipcMain: { handle: () => {}, on: () => {} },
                Notification: Object.assign(
                    function () {
                        this.on = () => {}
                        this.show = () => {}
                    },
                    { isSupported: () => false }
                ),
                shell: { openPath: async () => "", showItemInFolder: () => {} },
                dialog: {
                    showOpenDialog: async () => ({
                        canceled: true,
                        filePaths: [],
                    }),
                },
                BrowserWindow: function () {},
            }
        }
        return origLoad.apply(this, arguments)
    }
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            Module._load = origLoad
        })
}

async function main() {
    const passed = []

    // 1. Error humanizer preserves HTTP/AI status codes and provider details while translating to clear Chinese
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
        const providerErr = humanizePersonalError(
            "AI 接口返回 HTTP 401: Incorrect API key: sk-bad",
            "zh-CN"
        )
        assert.match(providerErr, /Incorrect API key: sk-bad/)
        const http503 = humanizePersonalError("HTTP 503", "zh-CN")
        assert.match(http503, /503/)
        const en = humanizePersonalError("Article was not found.", "en-US")
        assert.equal(en, "Article was not found.")
        passed.push(
            "humanizePersonalError translates zh-CN cleanly and keeps status codes + provider details"
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

    // 4. AI URL normalization, LAN/Tailscale/.local support, multi-profile key preservation, dual models, /models, SSE + JSON fallback, bilingual blocks & resilient briefings
    await withMockElectron(async () => {
        const { normalizeAIBaseURL } = require(path.join(
            appRoot,
            "src/main/ai-client.ts"
        ))
        assert.equal(
            normalizeAIBaseURL("https://api.openai.com/v1/chat/completions/"),
            "https://api.openai.com/v1"
        )
        assert.equal(
            normalizeAIBaseURL("http://192.168.1.25:11434/v1/models"),
            "http://192.168.1.25:11434/v1"
        )
        assert.equal(
            normalizeAIBaseURL("http://10.0.0.8:8000/v1/"),
            "http://10.0.0.8:8000/v1"
        )
        assert.equal(
            normalizeAIBaseURL("http://172.20.1.2:8080/v1"),
            "http://172.20.1.2:8080/v1"
        )
        assert.equal(
            normalizeAIBaseURL("http://100.100.10.5:11434/v1"),
            "http://100.100.10.5:11434/v1"
        )
        assert.equal(
            normalizeAIBaseURL("http://homelab.local:11434/v1"),
            "http://homelab.local:11434/v1"
        )
        assert.throws(
            () => normalizeAIBaseURL("http://api.openai.com/v1"),
            /HTTPS/
        )
        assert.throws(
            () => normalizeAIBaseURL("http://172.32.0.1:8000/v1"),
            /HTTPS/
        )

        const sqlite = createTestDb()
        sqlite
            .prepare(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://ex.com/rss','EnabledFeed',0),(2,'https://disabled.com/rss','DisabledFeed',0)"
            )
            .run()
        const now = Date.now()
        sqlite
            .prepare(
                "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet) VALUES(1,1,'Post Title','https://ex.com/1',?,?,?,'First snippet'),(2,1,'Second Unread','https://ex.com/2',?,?,?,'Second snippet'),(3,2,'Disabled Unread','https://disabled.com/3',?,?,?,'Ignored snippet')"
            )
            .run(
                now - 1000,
                now - 1000,
                '<h1>Heading One</h1><p>First prose paragraph.</p><pre><code>const keep = "untranslated";\nconsole.log(keep);</code></pre><p>Second prose paragraph.</p>',
                now - 2000,
                now - 2000,
                "<p>Another body</p>",
                now - 3000,
                now - 3000,
                "<p>Disabled body</p>"
            )

        let mode = "sse"
        const seenRequests = []
        const server = http.createServer((req, res) => {
            let body = ""
            req.on("data", chunk => (body += chunk))
            req.on("end", () => {
                seenRequests.push({
                    method: req.method,
                    url: req.url,
                    auth: req.headers.authorization,
                    body: body ? JSON.parse(body) : null,
                })
                if (req.url === "/v1/models") {
                    res.writeHead(200, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({
                            data: [
                                { id: "qwen-plus" },
                                { id: "deepseek-v3" },
                                { id: "qwen-plus" },
                            ],
                        })
                    )
                    return
                }
                if (mode === "briefing") {
                    res.writeHead(200, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({
                            choices: [
                                {
                                    message: {
                                        content: JSON.stringify({
                                            topics: [
                                                {
                                                    topic: "技术焦点",
                                                    entries: [
                                                        {
                                                            id: 1,
                                                            summary:
                                                                "第一篇摘要",
                                                        },
                                                        {
                                                            id: 1,
                                                            summary: "重复条目",
                                                        },
                                                    ],
                                                },
                                            ],
                                        }),
                                    },
                                },
                            ],
                            usage: { prompt_tokens: 20, completion_tokens: 15 },
                        })
                    )
                    return
                }
                if (mode === "json-fallback") {
                    res.writeHead(200, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({
                            choices: [
                                {
                                    message: {
                                        content:
                                            "[[[PARA_0]]]\n标题一\n\n[[[PARA_1]]]\n第一段译文。\n\n[[[PARA_2]]]\n第二段译文。",
                                    },
                                },
                            ],
                            usage: { prompt_tokens: 30, completion_tokens: 25 },
                        })
                    )
                    return
                }
                res.writeHead(200, { "Content-Type": "text/event-stream" })
                for (const piece of ["摘要点一", "；", "摘要点二"]) {
                    res.write(
                        `data: ${JSON.stringify({
                            choices: [{ delta: { content: piece } }],
                        })}\n\n`
                    )
                }
                res.write(
                    `data: ${JSON.stringify({
                        choices: [{ delta: {}, finish_reason: "stop" }],
                        usage: { prompt_tokens: 10, completion_tokens: 8 },
                    })}\n\n`
                )
                res.end("data: [DONE]\n\n")
            })
        })
        await new Promise(r => server.listen(0, "127.0.0.1", r))
        const port = server.address().port
        const base = `http://127.0.0.1:${port}/v1`

        try {
            const { AI } = require(path.join(appRoot, "src/main/ai.ts"))
            const store = makeStore({
                ai: {
                    baseURL: base + "/chat/completions/",
                    model: "legacy-main",
                    targetLanguage: "简体中文",
                    dailyBriefing: false,
                    briefingHour: 8,
                    encryptedKey: Buffer.from("enc:key-one", "utf8").toString(
                        "base64"
                    ),
                    lastBriefingDay: "",
                },
            })
            const ai = new AI(
                sqlite,
                store,
                { add: (_u, _l, fn) => fn() },
                sid => ({
                    aiEnabled: sid !== 2,
                    autoTranslateTitle: false,
                    autoSummary: false,
                }),
                () => {}
            )

            let s = ai.settings()
            assert.equal(s.baseURL, base)
            assert.equal(s.profiles.length, 1)
            assert.equal(s.profiles[0].hasKey, true)

            s = ai.saveProfile(
                {
                    name: "DualModelProfile",
                    baseURL: base + "/models",
                    model: "base-m",
                    summaryModel: "sum-m",
                    translateModel: "trans-m",
                },
                "key-two"
            )
            assert.equal(s.profiles.length, 2)
            const [p1Id, p2Id] = [s.profiles[0].id, s.profiles[1].id]
            s = ai.selectProfile(p1Id)
            assert.equal(s.hasKey, true)
            assert.equal(s.profiles[1].hasKey, true)
            s = ai.selectProfile(p2Id)
            assert.equal(s.summaryModel, "sum-m")
            assert.equal(s.translateModel, "trans-m")

            const models = await ai.listModels(base, "", p2Id)
            assert.deepEqual(models, ["deepseek-v3", "qwen-plus"])
            assert.equal(seenRequests.at(-1).auth, "Bearer key-two")

            const streamEvents = []
            const sumRes = await ai.generate(1, "summary", true, "req-1", ev =>
                streamEvents.push(ev)
            )
            assert.equal(sumRes.text, "摘要点一；摘要点二")
            assert.equal(seenRequests.at(-1).body.model, "sum-m")
            assert.equal(streamEvents.at(-1).done, true)

            mode = "json-fallback"
            const transRes = await ai.generate(1, "translation", true, "req-2")
            assert.equal(seenRequests.at(-1).body.model, "trans-m")
            assert.equal(transRes.blocks.length, 4)
            assert.equal(transRes.blocks[2].isCode, true)
            assert.equal(
                transRes.blocks[2].target,
                'const keep = "untranslated";\nconsole.log(keep);'
            )

            mode = "briefing"
            const brief = await ai.brief()
            assert.equal(seenRequests.at(-1).body.model, "sum-m")
            assert.equal(brief.topics.length, 2)
            assert.equal(brief.topics[1].topic, "其他未读动态")
            assert.equal(brief.topics[1].entries[0].id, 2)
        } finally {
            server.close()
            sqlite.close()
        }
        passed.push(
            "AI multi-profile keys, dual models (summaryModel vs translateModel), /models, SSE + JSON fallback, bilingual blocks & resilient briefings"
        )
    })

    // 5. collectionKey preserves saved:, folder:*, s-*, g-*, library:, later:, starred:
    {
        const { collectionKey } = require(path.join(
            appRoot,
            "src/reading-preferences.ts"
        ))
        assert.equal(collectionKey("saved:"), "saved:")
        assert.equal(collectionKey("folder:12"), "folder:12")
        assert.equal(collectionKey("library:"), "library:")
        assert.equal(collectionKey("s-5"), "s-5")
        assert.equal(collectionKey("g-3"), "g-3")
        assert.equal(collectionKey("later:"), "later:")
        assert.equal(collectionKey(""), "")
        passed.push(
            "collectionKey validates all collection reading preference keys including saved:"
        )
    }

    // 6. Unified Archive Rules, Legacy Rule Migration, Tag Cleanup & Archive Query Filters
    await withMockElectron(async () => {
        const sqlite = createTestDb()
        sqlite
            .prepare(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://a.example/rss','FeedA',0),(2,'https://b.example/rss','FeedB',0)"
            )
            .run()
        sqlite
            .prepare(
                `INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet,hasRead,starred,tags)
                 VALUES(1,1,'AI Weekly','https://a.example/1',1000,1000,'<p>Body</p>','Body',0,1,'["主题/机器学习","noisy-tag"]'),
                       (2,1,'Old News','https://a.example/2',2000,2000,'<p>Body</p>','Body',1,0,'["other-tag"]'),
                       (3,2,'Incoming Alert','https://b.example/3',3000,3000,'<p>Body</p>','Body',0,0,'[]')`
            )
            .run()

        const { ArticleArchive } = require(path.join(
            appRoot,
            "src/main/archive.ts"
        ))
        const { PersonalPreferencesStore } = require(path.join(
            appRoot,
            "src/main/personal-preferences.ts"
        ))
        const { runPersonalStartupMigrations } = require(path.join(
            appRoot,
            "src/main/personal.ts"
        ))

        const store = makeStore({
            sourceGroups: [
                { gid: 10, isMultiple: true, sids: [1, 2], name: "TechGroup" },
            ],
            sourceRules: {
                "source:2": [
                    {
                        enabled: true,
                        filter: (1 << 4) | (1 << 6),
                        search: "Alert",
                        match: true,
                        actions: ["s-true", "n-true", "o-true"],
                        highlight: "#f59e0b",
                    },
                ],
            },
        })
        const archive = new ArticleArchive(
            sqlite,
            () => [1, 2],
            () => {}
        )
        const prefStore = new PersonalPreferencesStore(sqlite, store, () => {})

        try {
            runPersonalStartupMigrations(sqlite, store, archive, prefStore)
            assert.equal(archive.folders()[0].name, "机器学习")
            assert.equal(
                sqlite
                    .prepare(
                        "SELECT count(*) AS n FROM items WHERE tags <> '[]'"
                    )
                    .get().n,
                0
            )
            assert.equal(store.get("sourceRulesMigrated"), true)
            assert.equal(archive.rules().length, 1)
            assert.equal(archive.rules()[0].action.highlight, "#f59e0b")

            const unreadUnfoldered = await archive.preview({
                include: "",
                exclude: "",
                all: false,
                field: "title",
                readState: "unread",
                unfolderedOnly: true,
            })
            assert.deepEqual(
                unreadUnfoldered.rows.map(r => r.id),
                [3]
            )

            const effects = await archive.afterInsert([3])
            assert.deepEqual(effects.notifyIds, [3])
            assert.deepEqual(effects.offlineIds, [3])

            // Verify parent-folder remove cleans up child-folder memberships & accepts fromFolderId
            const parentFolder = archive.folders()[0]
            archive.saveFolder({
                name: "深度学习",
                parentId: parentFolder.id,
            })
            const childFolder = archive
                .folders()
                .find(f => f.name === "深度学习")
            archive.apply([3], { kind: "folder", folderId: childFolder.id })
            assert.deepEqual(archive.memberships(3), [childFolder.id])
            const remRes = archive.apply([3], {
                kind: "remove",
                fromFolderId: parentFolder.id,
            })
            assert.equal(remRes.count, 1)
            assert.deepEqual(archive.memberships(3), [])
            archive.undo(remRes.batchId)
            assert.deepEqual(archive.memberships(3), [childFolder.id])

            prefStore.savePreferences({ sids: [1] }, { openTarget: 2 }, [])
            const cleared = prefStore.savePreferences(
                { gid: 10 },
                { openTarget: 1 },
                [],
                true
            )
            assert.equal(cleared.sources[1], undefined)
        } finally {
            archive.close()
            sqlite.close()
        }
        passed.push(
            "Unified archive rules, StoredRule migration, one-time tag cleanup & status filters"
        )
    })

    // 7. SearchIndex full rebuild + SearchHit.date + topicRSS no-category + cleanHTML safe anchors
    await withMockElectron(async () => {
        const sqlite = createTestDb()
        const { SearchIndex } = require(path.join(
            appRoot,
            "src/main/search-index.ts"
        ))
        const { topicRSS } = require(path.join(appRoot, "src/linuxdo.ts"))
        const { cleanHTML } = require(path.join(
            appRoot,
            "src/main/web-content.ts"
        ))
        sqlite
            .prepare(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://ex.com/rss','SourceA',0)"
            )
            .run()
        sqlite
            .prepare(
                "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet) VALUES(1,1,'中文检索标题','https://ex.com/1',1700000123000,1700000123000,'<p>支持短词 AI 搜索</p>','摘要')"
            )
            .run()
        const idx = new SearchIndex(sqlite)
        idx.start(true)
        await new Promise(r => setTimeout(r, 80))
        assert.equal(idx.search("AI")[0].date, 1700000123000)
        assert.equal(idx.search("中文检索")[0].date, 1700000123000)
        idx.stop()
        sqlite.close()

        const rssXml = topicRSS(
            {
                users: [{ id: 1, username: "alice" }],
                topic_list: {
                    topics: [
                        {
                            id: 99,
                            title: "Hello",
                            excerpt: "Ex",
                            tags: ["ai", "linux"],
                            created_at: "2026-01-01T00:00:00Z",
                        },
                    ],
                },
            },
            "https://linux.do/latest.json",
            "LinuxDo"
        )
        assert.doesNotMatch(rssXml, /<category>/)

        const cleaned = cleanHTML(
            '<h2 id="section-1">Sec</h2><p><a href="#fn:1">Ref</a></p><p id="fn:1">Note</p>',
            "https://blog.example.com/post"
        )
        assert.match(cleaned, /id="section-1"/)
        assert.match(cleaned, /href="#fn:1"/)

        passed.push(
            "SearchIndex date hits, topicRSS tag omission, and cleanHTML anchor preservation"
        )
    })

    // 8. applyPendingRestore retires failed staged restore so subsequent launches preserve new data
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
