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
const ipcHandlers = new Map()
const ipcSyncHandlers = new Map()
const notices = []

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
    const {
        ensureRuntimeSchemaIndexes,
        registerSafeRegexFunctions,
    } = require(path.join(appRoot, "src/main/sqlite-runtime.ts"))
    registerSafeRegexFunctions(sqlite)
    ensureRuntimeSchemaIndexes(sqlite)
    return sqlite
}

async function waitForSearchIndex(idx, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs
    while (idx.progress.running && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10))
    }
    assert.equal(idx.progress.running, false, "SearchIndex timed out")
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
        delete: k => {
            delete data[k]
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
                ipcMain: {
                    handle: (name, handler) => ipcHandlers.set(name, handler),
                    handleOnce: (name, handler) =>
                        ipcHandlers.set(name, async (...a) => {
                            ipcHandlers.delete(name)
                            return handler(...a)
                        }),
                    removeHandler: name => ipcHandlers.delete(name),
                    removeAllListeners: name => ipcSyncHandlers.delete(name),
                    on: (name, handler) => ipcSyncHandlers.set(name, handler),
                },
                ipcRenderer: {
                    sendSync: (name, ...args) => {
                        const event = {}
                        ipcSyncHandlers.get(name)(event, ...args)
                        return event.returnValue
                    },
                    invoke: async (name, ...args) =>
                        ipcHandlers.get(name)({}, ...args),
                },
                Notification: Object.assign(
                    function (options) {
                        this.on = () => {}
                        this.show = () => notices.push(options)
                    },
                    { isSupported: () => true }
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
            ipcHandlers.clear()
            ipcSyncHandlers.clear()
            notices.length = 0
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
                        // ShowRead + ShowNotStarred: this fixture targets all statuses.
                        filter: 3 | (1 << 4) | (1 << 6),
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
        await waitForSearchIndex(idx)
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

    await withMockElectron(async () => {
        const { ArticleArchive } = require(path.join(
            appRoot,
            "src/main/archive.ts"
        ))
        const { PersonalPreferencesStore } = require(path.join(
            appRoot,
            "src/main/personal-preferences.ts"
        ))
        const {
            runPersonalStartupMigrations,
            migrateStoredRulesToArchiveRules,
        } = require(path.join(appRoot, "src/main/personal.ts"))
        const { archiveMatches } = require(path.join(
            appRoot,
            "src/archive-types.ts"
        ))
        const { matchesConditions } = require(path.join(
            appRoot,
            "src/rule-conditions.ts"
        ))
        const sqlite = createTestDb()
        const archive = new ArticleArchive(sqlite, () => [1])
        try {
            sqlite.exec(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://review.example/rss','Review',0)"
            )
            sqlite
                .prepare(
                    "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet,tags) VALUES(1,1,'AI','https://review.example/1',1,1,'Body','Body',?)"
                )
                .run('["主题/Important","tag"]')
            const store = makeStore({ sourceRules: {}, sourceGroups: [] })
            const prefs = new PersonalPreferencesStore(sqlite, store, () => {})
            sqlite.exec(
                "CREATE TRIGGER migration_failure BEFORE INSERT ON folder_articles BEGIN SELECT RAISE(ABORT,'test migration failure'); END"
            )
            const warn = console.warn
            console.warn = () => {}
            try {
                runPersonalStartupMigrations(sqlite, store, archive, prefs)
            } finally {
                console.warn = warn
            }
            assert.equal(
                sqlite.prepare("SELECT tags FROM items WHERE _id=1").get().tags,
                '["主题/Important","tag"]'
            )
            assert.notEqual(store.get("tagsCleaned"), true)
            assert.equal(archive.folders().length, 0)
            sqlite.exec("DROP TRIGGER migration_failure")
            runPersonalStartupMigrations(sqlite, store, archive, prefs)
            assert.equal(
                sqlite.prepare("SELECT tags FROM items WHERE _id=1").get().tags,
                "[]"
            )
            assert.equal(store.get("tagsCleaned"), true)
            assert.equal(archive.memberships(1).length, 1)
            runPersonalStartupMigrations(sqlite, store, archive, prefs)
            assert.equal(archive.folders().length, 1)

            const rule = {
                filter: 83,
                search: "AI",
                match: true,
                actions: ["h-true"],
            }
            const row = {
                id: 1,
                title: "Weekly",
                body: "AI by Alice",
                author: "Bob",
                source: "Review",
                link: "https://review.example/1",
                date: 1,
            }
            const cases = [
                [
                    {
                        ...rule,
                        conditions: [
                            {
                                field: "title",
                                operator: "contains",
                                value: "AI",
                            },
                            {
                                field: "author",
                                operator: "contains",
                                value: "Alice",
                            },
                        ],
                        logic: "all",
                    },
                    row,
                ],
                [
                    {
                        ...rule,
                        conditions: [
                            {
                                field: "title",
                                operator: "contains",
                                value: "AI",
                            },
                            {
                                field: "title",
                                operator: "notContains",
                                value: "spam",
                            },
                        ],
                        logic: "any",
                    },
                    { ...row, title: "AI spam" },
                ],
                [
                    {
                        ...rule,
                        match: false,
                        conditions: [
                            {
                                field: "title",
                                operator: "contains",
                                value: "AI",
                            },
                            {
                                field: "title",
                                operator: "contains",
                                value: "weekly",
                            },
                        ],
                        logic: "all",
                    },
                    { ...row, title: "AI" },
                ],
                [
                    {
                        ...rule,
                        conditions: [
                            {
                                field: "title",
                                operator: "contains",
                                value: "AI",
                                caseSensitive: true,
                            },
                            {
                                field: "body",
                                operator: "contains",
                                value: "ALICE",
                                caseSensitive: false,
                            },
                        ],
                        logic: "all",
                    },
                    { ...row, title: "AI" },
                ],
            ]
            for (const [original, input] of cases) {
                const expected =
                    matchesConditions(original.conditions, original.logic, {
                        title: input.title,
                        snippet: input.body,
                        creator: input.author,
                        link: input.link,
                    }) === original.match
                const migrated = migrateStoredRulesToArchiveRules(sqlite, {
                    all: [original],
                })[0]
                assert.equal(archiveMatches(migrated.query, input), expected)
            }
            const stored = {
                "source:1": [
                    { ...rule, actions: ["s-false", "n-false", "o-false"] },
                ],
                "group:10": [{ ...rule, actions: ["s-true"] }],
                "all": [{ ...rule, actions: ["s-true", "n-true", "o-true"] }],
            }
            for (const migrated of migrateStoredRulesToArchiveRules(
                sqlite,
                stored
            ))
                archive.saveRule(migrated)
            const effects = await archive.afterInsert([1])
            assert.deepEqual(
                sqlite
                    .prepare(
                        "SELECT starred,notify,saveRequested FROM items WHERE _id=1"
                    )
                    .get(),
                { starred: 0, notify: 0, saveRequested: 0 }
            )
            assert.deepEqual(effects, { notifyIds: [], offlineIds: [] })
            const negativeOnly = migrateStoredRulesToArchiveRules(sqlite, {
                all: [{ ...rule, actions: ["n-false", "o-false"] }],
            })
            assert.equal(negativeOnly.length, 1)
            assert.equal(negativeOnly[0].action.notify, false)
            assert.equal(negativeOnly[0].action.autoOffline, false)
        } finally {
            archive.close()
            sqlite.close()
        }
        passed.push(
            "Review regressions: atomic tag migration, compound conditions, scope order and negative side effects"
        )
    })

    await withMockElectron(async () => {
        const { AIClient } = require(path.join(
            appRoot,
            "src/main/ai-client.ts"
        ))
        const { AI } = require(path.join(appRoot, "src/main/ai.ts"))
        const sqlite = createTestDb()
        const store = makeStore({
            ai: {
                baseURL: "http://127.0.0.1/v1",
                model: "test",
                targetLanguage: "中文",
            },
        })
        const queue = { add: (_u, _l, fn) => fn() }
        const client = new AIClient(sqlite, store, queue, () => {})
        const config = client.config()
        const sse = (reason, done = false) =>
            new Response(
                'data: {"choices":[{"delta":{"content":"半段内容"}}]}\n\n' +
                    (reason
                        ? `data: ${JSON.stringify({
                              choices: [{ finish_reason: reason }],
                          })}\n\n`
                        : "") +
                    (done ? "data: [DONE]\n\n" : ""),
                { headers: { "content-type": "text/event-stream" } }
            )
        try {
            for (const [reason, done] of [
                [null, false],
                ["length", true],
                ["content_filter", true],
                ["error", true],
            ]) {
                client.doFetch = async () => sse(reason, done)
                await assert.rejects(
                    client.cached(
                        config,
                        null,
                        "summary-part",
                        "summarize",
                        "input",
                        undefined,
                        true,
                        { stream: true }
                    ),
                    /截断|结束|中断|异常/
                )
                assert.equal(
                    sqlite.prepare("SELECT count(*) AS n FROM ai_cache").get()
                        .n,
                    0
                )
            }
            for (const [reason, done] of [
                [null, true],
                ["stop", false],
                ["end_turn", false],
                ["eos", false],
                ["completed", false],
            ]) {
                client.doFetch = async () => sse(reason, done)
                assert.equal(
                    (
                        await client.call(
                            config,
                            "summary",
                            "summarize",
                            "input",
                            { stream: true }
                        )
                    ).text,
                    "半段内容"
                )
            }
            client.doFetch = async () =>
                new Response(
                    JSON.stringify({
                        choices: [
                            {
                                message: { content: "被过滤内容" },
                                finish_reason: "content_filter",
                            },
                        ],
                    }),
                    { headers: { "content-type": "application/json" } }
                )
            await assert.rejects(
                client.cached(config, null, "summary", "summarize", "json"),
                /结束|异常/
            )
            assert.equal(
                sqlite.prepare("SELECT count(*) AS n FROM ai_cache").get().n,
                0
            )

            sqlite.exec(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://ai.example/rss','AI',0)"
            )
            sqlite
                .prepare(
                    "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet) VALUES(1,1,'Test','https://ai.example/1',1,1,?,'First Second Third')"
                )
                .run("<p>First</p><pre>code</pre><p>Second</p><p>Third</p>")
            const ai = new AI(
                sqlite,
                store,
                queue,
                () => ({ aiEnabled: true }),
                () => {}
            )
            const requests = []
            let missingFails = false
            let ambiguous = false
            ai.client.doFetch = async (_url, init) => {
                const input = JSON.parse(init.body).messages[1].content
                requests.push(input)
                const text = input.includes("[[[PARA_0]]]")
                    ? ambiguous
                        ? "合并后的无标记译文"
                        : "[[[PARA_0]]]\n第一段\n[[[PARA_2]]]\n第三段"
                    : missingFails
                    ? "   "
                    : { First: "第一段", Second: "第二段", Third: "第三段" }[
                          input
                      ]
                return new Response(
                    JSON.stringify({
                        choices: [
                            {
                                message: { content: text },
                                finish_reason: "stop",
                            },
                        ],
                    }),
                    { headers: { "content-type": "application/json" } }
                )
            }
            const translated = await ai.generate(1, "translation")
            assert.deepEqual(
                translated.blocks.map(b => b.target),
                ["第一段", "code", "第二段", "第三段"]
            )
            assert.equal(requests.length, 2)
            assert.equal(requests[1], "Second")
            assert.equal(
                sqlite
                    .prepare(
                        "SELECT count(*) AS n FROM ai_cache WHERE result LIKE '%PARA_%'"
                    )
                    .get().n,
                0,
                "invalid batch never cached"
            )
            const cachedEnvelope = sqlite
                .prepare(
                    "SELECT key,result FROM ai_cache WHERE kind='translation-blocks'"
                )
                .get()
            const bad = JSON.parse(cachedEnvelope.result)
            bad.blocks[2].target = " "
            sqlite
                .prepare("UPDATE ai_cache SET result=? WHERE key=?")
                .run(JSON.stringify(bad), cachedEnvelope.key)
            assert.equal(
                ai.articleState(1).blocks,
                undefined,
                "historical incomplete cache hidden"
            )
            const repaired = await ai.generate(1, "translation")
            assert.equal(repaired.blocks[2].target, "第二段")
            assert.equal(repaired.cached, false)

            sqlite.exec("DELETE FROM ai_cache")
            ambiguous = true
            requests.length = 0
            assert.equal(
                (await ai.generate(1, "translation")).blocks.filter(
                    b => !b.isCode
                ).length,
                3
            )
            assert.equal(
                requests.length,
                4,
                "ambiguous alignment retranslates each paragraph"
            )
            sqlite.exec("DELETE FROM ai_cache")
            missingFails = true
            await assert.rejects(
                ai.generate(1, "translation"),
                /有效内容|译文|翻译/
            )
            assert.equal(
                sqlite.prepare("SELECT count(*) AS n FROM ai_cache").get().n,
                0
            )
        } finally {
            sqlite.close()
        }
        passed.push(
            "AI completeness: incomplete SSE/filtered JSON rejected, missing translation repaired, invalid cache ignored"
        )
    })

    await withMockElectron(async () => {
        const Module = require("node:module")
        const originalLoad = Module._load
        const persisted = makeStore()
        Module._load = function (request) {
            if (request === "electron-store")
                return function () {
                    return persisted
                }
            return originalLoad.apply(this, arguments)
        }
        const settingsFile = path.join(appRoot, "src/main/settings.ts")
        const oldWindow = globalThis.window
        const oldStorage = globalThis.localStorage
        const legacy = new Map([
            ["personal:unseenDelta", '{"bySource":{"1":3},"all":3}'],
            ["personal:openFolders", '["folder:2","folder:2","bad"]'],
        ])
        globalThis.localStorage = {
            getItem: k => legacy.get(k) ?? null,
            removeItem: k => legacy.delete(k),
        }
        try {
            delete require.cache[settingsFile]
            require(settingsFile)
            const bridge = require(path.join(
                appRoot,
                "src/bridges/settings.ts"
            )).default
            globalThis.window = { settings: bridge }
            const state = require(path.join(
                appRoot,
                "src/scripts/sidebar-state.ts"
            ))
            assert.deepEqual(state.loadStoredUnseen(), {
                bySource: { 1: 3 },
                all: 3,
            })
            assert.deepEqual([...state.loadOpenFolders()], ["folder:2"])
            state.saveStoredUnseen({ 1: 8, 2: 2 }, 10)
            state.saveOpenFolders(new Set(["folder:2", "folder:3"]))
            await new Promise(resolve => setImmediate(resolve))
            assert.equal(legacy.size, 0)
            // Simulate session cleanup and main-process module restart over persisted settings.
            legacy.clear()
            delete require.cache[settingsFile]
            require(settingsFile)
            assert.deepEqual(state.loadStoredUnseen(), {
                bySource: { 1: 8, 2: 2 },
                all: 10,
            })
            assert.deepEqual(
                [...state.loadOpenFolders()],
                ["folder:2", "folder:3"]
            )
            await bridge.setUnseenDelta({
                all: Infinity,
                bySource: { 1: 2, 2: -2, 3: "5", bad: 4 },
            })
            assert.deepEqual(bridge.getUnseenDelta(), {
                bySource: { 1: 2 },
                all: 0,
            })
            await bridge.setOpenFolders([
                "folder:4",
                "folder:4",
                "folder:-1",
                {},
                "folder:1e3",
            ])
            assert.deepEqual(bridge.getOpenFolders(), ["folder:4"])
            persisted.set("unseenDelta", "corrupt")
            persisted.set("openFolders", {})
            assert.deepEqual(state.loadStoredUnseen(), { bySource: {}, all: 0 })
            assert.deepEqual([...state.loadOpenFolders()], [])

            legacy.set("personal:unseenDelta", '{"all":7,"bySource":{"1":7}}')
            globalThis.window.settings = {
                ...bridge,
                getUnseenDelta: () => null,
                setUnseenDelta: async () => {
                    throw new Error("disk failure")
                },
            }
            assert.equal(state.loadStoredUnseen().all, 7)
            await new Promise(resolve => setImmediate(resolve))
            assert.equal(
                legacy.has("personal:unseenDelta"),
                true,
                "failed migration preserves legacy state"
            )
        } finally {
            globalThis.window = oldWindow
            globalThis.localStorage = oldStorage
            Module._load = originalLoad
            delete require.cache[settingsFile]
        }
        passed.push(
            "Sidebar persistence: real settings IPC + bridge, legacy migration, restart, validation and failed-save fallback"
        )
    })

    await withMockElectron(async () => {
        const { initPersonal } = require(path.join(
            appRoot,
            "src/main/personal.ts"
        ))
        const { ArticleArchive } = require(path.join(
            appRoot,
            "src/main/archive.ts"
        ))
        const sqlite = createTestDb()
        const archive = new ArticleArchive(sqlite)
        const oldWindow = globalThis.window
        try {
            sqlite.exec(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://notice.example/rss','Notices',0)"
            )
            for (let id = 1; id <= 8; id++)
                sqlite
                    .prepare(
                        "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet,notify) VALUES(?,1,?,?,1,1,'Body','Body',1)"
                    )
                    .run(id, `Article ${id}`, `https://notice.example/${id}`)
            const contents = {
                isDestroyed: () => false,
                send: () => {},
                mainFrame: {},
            }
            const manager = {
                hasWindow: () => true,
                mainWindow: { webContents: contents },
            }
            const store = makeStore({
                sourceGroups: [],
                sourcePreferences: {
                    sources: {
                        1: {
                            aiEnabled: false,
                            offlineEnabled: false,
                            autoFullText: false,
                        },
                    },
                    groups: {},
                },
            })
            initPersonal(sqlite, store, manager)
            const event = { sender: contents, senderFrame: contents.mainFrame }
            notices.length = 0
            assert.equal(
                (await ipcHandlers.get("personal:afterInsert")(event, [1, 1]))
                    .ok,
                true
            )
            assert.equal(
                notices.length,
                1,
                "no rules: final DB notify still applies, duplicate IDs send once"
            )

            // Execute the actual renderer thunk with unrelated renderer imports stubbed.
            const Module = require("node:module")
            const mod = new Module(
                path.join(appRoot, "src/scripts/models/app.ts"),
                module
            )
            mod.filename = mod.id
            mod.paths = module.paths
            mod.require = request =>
                request === "react-intl-universal"
                    ? { get: () => "Untitled" }
                    : {}
            require.extensions[".ts"](mod, mod.filename)
            globalThis.window = {
                personal: {
                    notifyItem: () => {
                        throw new Error(
                            "renderer emitted a desktop notification"
                        )
                    },
                },
            }
            const logs = []
            mod.exports.pushNotification({
                _id: 1,
                source: 1,
                title: "Article 1",
            })(
                action => logs.push(action),
                () => ({ sources: { 1: { name: "Notices" } } })
            )
            assert.equal(logs[0].type, "PUSH_NOTIFICATION")
            assert.equal(notices.length, 1)
            notices.length = 0
            assert.equal(
                (
                    await ipcHandlers.get("personal:afterInsert")(
                        event,
                        [1, 2, 3, 4, 5, 6, 7, 8]
                    )
                ).ok,
                true
            )
            assert.equal(notices.length, 5)
            archive.saveRule({
                id: "suppress",
                name: "Suppress",
                enabled: true,
                query: {
                    include: "Article",
                    exclude: "",
                    all: false,
                    field: "title",
                },
                action: { kind: "notify", notify: false },
            })
            notices.length = 0
            assert.equal(
                (await ipcHandlers.get("personal:afterInsert")(event, [1, 2]))
                    .ok,
                true
            )
            assert.equal(notices.length, 0)
        } finally {
            globalThis.window = oldWindow
            archive.close()
            sqlite.close()
        }
        passed.push(
            "Notifications: real afterInsert IPC emits once, renderer keeps log only, batch capped at five and final false suppresses"
        )
    })

    await withMockElectron(async () => {
        const { ArticleArchive } = require(path.join(
            appRoot,
            "src/main/archive.ts"
        ))
        const {
            runPersonalStartupMigrations,
            migrateStoredRulesToArchiveRules,
        } = require(path.join(appRoot, "src/main/personal.ts"))
        const { PersonalPreferencesStore } = require(path.join(
            appRoot,
            "src/main/personal-preferences.ts"
        ))
        const {
            archiveMatches,
            archiveExcerpt,
            emptyArchiveQuery,
        } = require(path.join(appRoot, "src/archive-types.ts"))
        const { ArchiveMatcher, queryArchiveRows } = require(path.join(
            appRoot,
            "src/main/archive-matcher.ts"
        ))
        const { SearchIndex } = require(path.join(
            appRoot,
            "src/main/search-index.ts"
        ))
        const sqlite = createTestDb()
        const archive = new ArticleArchive(sqlite, () => [1])
        const matcher = new ArchiveMatcher()
        try {
            sqlite.exec(
                "INSERT INTO sources(sid,url,name,lastFetched) VALUES(1,'https://edges.example/rss','Edges',0)"
            )
            sqlite
                .prepare(
                    "INSERT INTO items(_id,source,title,link,date,fetchedDate,content,snippet,tags) VALUES(1,1,'AI q','https://edges.example/1',100,100,'<p>Body Alice</p>','Body Alice',?)"
                )
                .run('["主题/Retry","tag"]')
            const originalReading = {
                collections: { "tag:主题/Retry": { view: 1 } },
            }
            for (const failKey of ["readingPreferences", "tagsCleaned"]) {
                const store = makeStore({ readingPreferences: originalReading })
                const prefs = new PersonalPreferencesStore(
                    sqlite,
                    store,
                    () => {}
                )
                const save = store.set
                store.set = (key, value) => {
                    if (key === failKey)
                        throw new Error("injected settings failure")
                    save(key, value)
                }
                const warn = console.warn
                console.warn = () => {}
                try {
                    runPersonalStartupMigrations(sqlite, store, archive, prefs)
                } finally {
                    console.warn = warn
                }
                assert.equal(
                    sqlite.prepare("SELECT tags FROM items WHERE _id=1").get()
                        .tags,
                    '["主题/Retry","tag"]'
                )
                assert.equal(archive.folders().length, 0)
                assert.equal(archive.memberships(1).length, 0)
                assert.notEqual(store.get("tagsCleaned"), true)
                assert.deepEqual(
                    store.get("readingPreferences"),
                    originalReading
                )
            }
            const base = {
                filter: 83,
                search: "AI",
                match: true,
                actions: ["s-true"],
            }
            for (const bad of [
                {
                    ...base,
                    conditions: [
                        { field: "bad", operator: "contains", value: "AI" },
                    ],
                },
                { ...base, filter: 19, search: "[" },
                { ...base, actions: "n-true" },
                {
                    ...base,
                    match: "false",
                    conditions: [
                        { field: "title", operator: "contains", value: "AI" },
                    ],
                },
                null,
            ]) {
                const migrated = migrateStoredRulesToArchiveRules(sqlite, {
                    all: [bad],
                })
                assert.equal(migrated.length, 1)
                assert.equal(migrated[0].enabled, false)
                assert.match(migrated[0].error, /无法安全迁移/)
            }
            const row = {
                id: 1,
                title: "AI",
                body: "Body Alice",
                snippet: "Body Alice",
                author: "Bob",
                source: "Edges",
                link: "https://edges.example/1",
                date: 100,
                hasRead: 0,
                starred: 0,
                hidden: 0,
                feedHidden: 0,
            }
            for (const [flags, match, title, expected] of [
                [83 | 128 | 256, true, "AI", true],
                [83 | 128, false, "AI", true],
                [83 | 128 | 256, true, "AI weekly", false],
                [83 | 128, false, "AI weekly", false],
            ]) {
                const migrated = migrateStoredRulesToArchiveRules(sqlite, {
                    all: [
                        { ...base, filter: flags, search: "AI,weekly", match },
                    ],
                })[0]
                assert.equal(
                    archiveMatches(migrated.query, { ...row, title }),
                    expected
                )
            }
            const phrase = migrateStoredRulesToArchiveRules(sqlite, {
                all: [{ ...base, search: "AI weekly" }],
            })[0]
            assert.equal(
                archiveMatches(phrase.query, {
                    ...row,
                    title: "AI something weekly",
                }),
                false
            )
            const unread = migrateStoredRulesToArchiveRules(sqlite, {
                all: [{ ...base, filter: 82 }],
            })[0]
            assert.equal(archiveMatches(unread.query, row), true)
            assert.equal(
                archiveMatches(unread.query, { ...row, hasRead: 1 }),
                false
            )
            assert.equal(
                archiveMatches(unread.query, { ...row, hidden: 1 }),
                false
            )

            // A single legacy rule matches once even when its first action changes that filter.
            const store = makeStore({
                sourceRules: {
                    all: [
                        {
                            ...base,
                            filter: 82,
                            actions: [
                                "r-true",
                                "h-true",
                                "s-true",
                                "n-true",
                                "o-true",
                            ],
                        },
                    ],
                },
            })
            runPersonalStartupMigrations(
                sqlite,
                store,
                archive,
                new PersonalPreferencesStore(sqlite, store, () => {})
            )
            const effects = await archive.afterInsert([1])
            assert.deepEqual(
                sqlite
                    .prepare(
                        "SELECT hasRead,hidden,starred,notify,saveRequested FROM items WHERE _id=1"
                    )
                    .get(),
                {
                    hasRead: 1,
                    hidden: 1,
                    starred: 1,
                    notify: 1,
                    saveRequested: 1,
                }
            )
            assert.deepEqual(effects, { notifyIds: [1], offlineIds: [1] })
            for (const action of [
                { kind: "notify", notify: false },
                { kind: "offline", autoOffline: false },
            ]) {
                const applied = archive.apply([1], action)
                const field =
                    action.kind === "notify" ? "notify" : "saveRequested"
                assert.equal(
                    sqlite
                        .prepare(
                            `SELECT ${field} AS flag FROM items WHERE _id=1`
                        )
                        .get().flag,
                    0
                )
                archive.undo(applied.batchId)
                assert.equal(
                    sqlite
                        .prepare(
                            `SELECT ${field} AS flag FROM items WHERE _id=1`
                        )
                        .get().flag,
                    1
                )
            }
            sqlite.exec(
                "DELETE FROM archive_rules; UPDATE items SET hidden=0,starred=0"
            )
            const index = new SearchIndex(sqlite)
            index.start(true)
            await waitForSearchIndex(index)
            index.stop()
            assert.equal(index.progress.error, undefined)
            const bodyQuery = {
                ...emptyArchiveQuery,
                field: "title",
                include: "DOES_NOT_EXIST",
                conditions: [
                    { field: "body", operator: "contains", value: "Alice" },
                ],
            }
            const rows = queryArchiveRows(sqlite, () => [1], bodyQuery)
            assert.equal(
                rows.length,
                1,
                "structured conditions bypass ordinary FTS include prefilter"
            )
            assert.match(rows[0].body, /Alice/)
            assert.equal((await archive.preview(bodyQuery)).rows.length, 1)
            assert.match(archiveExcerpt(bodyQuery, rows[0]).text, /Alice/)
            archive.saveRule({
                name: "Body",
                enabled: true,
                query: bodyQuery,
                action: { kind: "star" },
            })
            await archive.afterInsert([1])
            assert.equal(
                sqlite.prepare("SELECT starred FROM items WHERE _id=1").get()
                    .starred,
                1
            )
            for (const patch of [
                { readState: "unread" },
                { starredOnly: true },
                { start: 101 },
                { end: 100 },
                { sids: [2] },
                { unfolderedOnly: true },
            ]) {
                const input = {
                    ...row,
                    hasRead: 1,
                    starred: 0,
                    sourceId: 1,
                    inFolder: 1,
                }
                assert.equal(
                    archiveMatches({ ...bodyQuery, ...patch }, input),
                    false
                )
            }

            const regexQuery = {
                ...emptyArchiveQuery,
                field: "title",
                conditions: [
                    { field: "title", operator: "regex", value: "\\q" },
                ],
            }
            assert.equal(
                (
                    await matcher.match(
                        regexQuery,
                        [{ ...row, title: "q" }],
                        true
                    )
                ).length,
                1,
                "legacy regex does not gain a u flag"
            )
            assert.equal(
                (
                    await matcher.match(regexQuery, [
                        { ...row, title: "no match" },
                    ])
                ).length,
                0
            )
            assert.ok(matcher.worker, "structured regex uses the worker")
            const longMatch = await matcher.match(
                regexQuery,
                [{ ...row, title: "x".repeat(300) + "q" }],
                true
            )
            assert.equal(longMatch[0].excerpt.length, 1)
            assert.match(longMatch[0].excerpt.text, /q/)
            await assert.rejects(
                matcher.match(
                    {
                        ...regexQuery,
                        conditions: [
                            {
                                field: "title",
                                operator: "regex",
                                value: "(a+)+$",
                            },
                        ],
                    },
                    [{ ...row, title: "a".repeat(42) + "!" }]
                ),
                /超时/
            )
            assert.equal(
                (await matcher.match(regexQuery, [{ ...row, title: "q" }]))
                    .length,
                1,
                "worker recovers after timeout"
            )
            const legacyRegex = migrateStoredRulesToArchiveRules(sqlite, {
                all: [{ ...base, filter: 19, search: "\\q" }],
            })[0]
            assert.equal(
                (
                    await matcher.match(legacyRegex.query, [
                        { ...row, title: "q" },
                    ])
                ).length,
                1
            )
            assert.equal(
                (await matcher.match(legacyRegex.query, [row])).length,
                0
            )
        } finally {
            matcher.terminate()
            archive.close()
            sqlite.close()
        }
        passed.push(
            "Migration edges: post-commit rollback, damaged rules, legacy boolean semantics, multi-action matching, false undo, body/FTS and isolated regex"
        )
    })

    {
        const React = require("react")
        const { createRoot } = require("react-dom/client")
        const Module = require("node:module")
        const oldWindow = globalThis.window
        const oldDocument = globalThis.document
        const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
        const dom = parseHTML(
            "<html><body><div id='test-root'></div></body></html>"
        )
        globalThis.window = dom.window
        globalThis.document = dom.document
        globalThis.IS_REACT_ACT_ENVIRONMENT = true
        const saved = []
        window.personal = {
            archivePreview: async () => ({ token: "preview", rows: [] }),
            archiveSaveRule: async rule => {
                saved.push(rule)
                return rule
            },
        }
        const moduleFile = path.join(
            appRoot,
            "src/components/personal/archive/useOrganizeState.ts"
        )
        const mod = new Module(moduleFile, module)
        mod.filename = moduleFile
        mod.paths = module.paths
        const appState = {
            feeds: {},
            page: { feedId: "all" },
            app: { title: "All", menuKey: "ALL" },
        }
        mod.require = request => {
            if (request === "react") return React
            if (request.endsWith("archive-types"))
                return require(path.join(appRoot, "src/archive-types.ts"))
            if (request.endsWith("reducer"))
                return {
                    useAppDispatch: () => () => {},
                    useAppSelector: selector => selector(appState),
                }
            return {}
        }
        require.extensions[".ts"](mod, moduleFile)
        let current
        function TestHarness() {
            current = mod.exports.useOrganizeState()
            return null
        }
        const root = createRoot(document.getElementById("test-root"))
        try {
            await React.act(async () =>
                root.render(React.createElement(TestHarness))
            )
            for (const query of [
                {
                    include: "",
                    exclude: "",
                    all: false,
                    field: "title",
                    sids: [1],
                    conditions: [
                        {
                            field: "body",
                            operator: "notContains",
                            value: "spam",
                            caseSensitive: true,
                        },
                    ],
                    logic: "any",
                    negate: true,
                },
                {
                    include: "",
                    exclude: "",
                    all: false,
                    field: "title",
                    legacyFilter: {
                        type: 83 | 128 | 256,
                        search: "AI,weekly",
                        match: false,
                    },
                },
            ]) {
                const rule = {
                    id: "edit",
                    name: "Keep semantics",
                    enabled: true,
                    query,
                    action: {
                        kind: "notify",
                        notify: false,
                        autoOffline: false,
                    },
                }
                await React.act(async () =>
                    window.dispatchEvent(
                        new window.CustomEvent("organize-articles", {
                            detail: rule,
                        })
                    )
                )
                await React.act(async () => current.saveOnly())
                assert.deepEqual(saved.at(-1).query, query)
                assert.equal(saved.at(-1).action.notify, false)
                assert.equal(saved.at(-1).action.autoOffline, false)
            }
        } finally {
            await React.act(async () => root.unmount())
            globalThis.window = oldWindow
            globalThis.document = oldDocument
            globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment
        }
        passed.push(
            "Rule editor roundtrip: actual React hook preserves structured/legacy queries and explicit false actions"
        )
    }

    {
        const crypto = require("node:crypto")
        const vm = require("node:vm")
        const jsPath = path.join(appRoot, "dist/article/article.js")
        const htmlPath = path.join(appRoot, "dist/article/article.html")
        const jsBuf = fs.readFileSync(jsPath)
        const htmlBuf = fs.readFileSync(htmlPath)
        assert.equal(jsBuf.includes(13), false, "article.js must stay LF")
        assert.equal(htmlBuf.includes(13), false, "article.html must stay LF")
        const expectedHash =
            "sha256-" +
            crypto.createHash("sha256").update(jsBuf).digest("base64")
        const htmlText = htmlBuf.toString("utf8")
        assert.ok(
            htmlText.includes(`script-src-elem '${expectedHash}'`),
            "CSP script-src-elem must match article.js SHA-256"
        )
        assert.ok(
            htmlText.includes(`integrity="${expectedHash}"`),
            "script integrity must match article.js SHA-256"
        )

        const dom = parseHTML(htmlText)
        dom.window.requestAnimationFrame = fn => {
            fn()
            return 1
        }
        dom.window.getComputedStyle = () => ({ getPropertyValue: () => "" })
        dom.window.CSS = { supports: () => false }
        dom.window.scrollTo = () => {}
        if (!dom.document.adoptNode) {
            dom.document.adoptNode = node => dom.document.importNode(node, true)
        }
        if (!dom.window.navigator) dom.window.navigator = {}
        dom.window.navigator.clipboard = { writeText: async () => {} }
        const ctx = vm.createContext({
            window: dom.window,
            document: dom.document,
            Element: dom.window.Element,
            HTMLElement: dom.window.HTMLElement || dom.window.Element,
            HTMLDialogElement:
                dom.window.HTMLDialogElement || function HTMLDialogElement() {},
            Event: dom.window.Event,
            CustomEvent: dom.window.CustomEvent,
            location: { search: "", href: "file:///article.html" },
            Node: dom.window.Node,
            DOMParser: class {
                parseFromString(str) {
                    return parseHTML(
                        "<!doctype html><html><body>" +
                            String(str || "") +
                            "</body></html>"
                    ).document
                }
            },
            URL,
            URLSearchParams,
            navigator: dom.window.navigator,
            CSS: dom.window.CSS,
            getComputedStyle: dom.window.getComputedStyle,
            requestAnimationFrame: dom.window.requestAnimationFrame,
            setTimeout,
            clearTimeout,
            Math,
            Number,
            String,
            Array,
            Object,
            Set,
            WeakMap,
            Date,
            RegExp,
            parseInt,
            parseFloat,
            isNaN,
        })
        vm.runInContext(jsBuf.toString("utf8"), ctx, { filename: jsPath })

        dom.window.__renderArticle({
            epoch: 7,
            title: "Sanitizer Check",
            dateText: "2026-11-27",
            url: "https://linux.do/t/topic/42",
            html: '<p class="lightbox-btn code-header keep-class">Safe text</p><iframe src="https://player.example.com/embed/9" title="Demo Video"></iframe><iframe src="javascript:alert(1)"></iframe><video src="data:text/html,boom"></video><img src="data:image/png;base64,iVBORw0KGgo=" alt="inline" />',
        })
        assert.equal(dom.document.querySelectorAll("iframe").length, 0)
        const downgradedLink = dom.document.querySelector(
            'a[href="https://player.example.com/embed/9"]'
        )
        assert.ok(downgradedLink, "HTTPS iframe downgraded to external link")
        assert.match(downgradedLink.textContent, /Demo Video/)
        const para = dom.document.querySelector("p.keep-class")
        assert.ok(para, "non-reserved class preserved")
        assert.equal(para.classList.contains("lightbox-btn"), false)
        assert.equal(para.classList.contains("code-header"), false)
        assert.equal(
            dom.document.querySelector("video").getAttribute("src"),
            null,
            "non-IMG data: URL stripped"
        )
        assert.match(
            dom.document.querySelector("#main article img").getAttribute("src"),
            /^data:image\/png/
        )

        dom.window.__appendReplies(
            [{ floor: 2, author: "StaleUser", html: "<p>Stale</p>" }],
            6
        )
        assert.equal(
            dom.document.getElementById("replies"),
            null,
            "stale epoch replies ignored"
        )
        dom.window.__appendReplies(
            [{ floor: 2, author: "FreshUser", html: "<p>Fresh floor</p>" }],
            7
        )
        assert.equal(
            dom.document.querySelectorAll("#replies .reply-floor").length,
            1
        )
        passed.push(
            "Article reader container: LF + dual SHA-256 SRI/CSP, iframe downgrade, data: non-IMG strip, reserved class strip, reply epoch guard"
        )
    }

    await withMockElectron(async () => {
        const sqlite = createTestDb()
        const { isSafeSqliteRegexPattern } = require(path.join(
            appRoot,
            "src/main/sqlite-runtime.ts"
        ))
        const { SearchIndex } = require(path.join(
            appRoot,
            "src/main/search-index.ts"
        ))
        const index = new SearchIndex(sqlite)
        try {
            sqlite
                .prepare(
                    "INSERT INTO sources (sid,url,name,lastFetched) VALUES (1,'https://example.com/rss','Ex',0)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO items (_id,source,title,link,date,fetchedDate,content,snippet) VALUES (1,1,'AlphaTitle','https://example.com/1',100,100,'<p>FeedBody</p>','FeedBody')"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO article_content (itemId,fullHtml,fullText,fullFetchedAt) VALUES (1,'<p>InitialFullBody</p>','InitialFullBody',100)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO article_notes (itemId,text,version,updatedAt) VALUES (1,'InitialNoteBody',1,100)"
                )
                .run()
            index.start(true)
            await waitForSearchIndex(index)

            sqlite
                .prepare(
                    "UPDATE article_content SET fullText='LiveUpdatedFullBody' WHERE itemId=1"
                )
                .run()
            sqlite
                .prepare(
                    "UPDATE article_notes SET text='LiveUpdatedNoteBody', version=2 WHERE itemId=1"
                )
                .run()
            assert.equal(
                index.search("LiveUpdatedFullBody")[0].id,
                1,
                "runtime trigger syncs article_content updates into article_fts"
            )
            assert.equal(
                index.search("LiveUpdatedNoteBody")[0].id,
                1,
                "runtime trigger syncs article_notes updates into article_fts"
            )
            sqlite.prepare("DELETE FROM items WHERE _id=1").run()
            assert.equal(
                sqlite
                    .prepare(
                        "SELECT count(*) AS n FROM article_fts WHERE rowid=1"
                    )
                    .get().n,
                0,
                "deleting item removes row from article_fts"
            )

            assert.equal(isSafeSqliteRegexPattern("(a+)+$"), false)
            assert.equal(
                sqlite
                    .prepare("SELECT ? REGEXP ? AS m")
                    .get("a".repeat(48) + "!", "(a+)+$").m,
                0,
                "unsafe catastrophic pattern rejected without hanging"
            )
            assert.equal(
                sqlite
                    .prepare("SELECT 'Fluent 2026' REGEXP '\\d{4}' AS m")
                    .get().m,
                1
            )

            const insertItem = sqlite.prepare(
                "INSERT INTO items (_id,source,title,link,date,fetchedDate,content,snippet) VALUES (?,1,?,?,100,100,'<p>Body</p>','Body')"
            )
            for (let i = 10; i < 160; i++) {
                insertItem.run(
                    i,
                    `RebuildTitle_${i}`,
                    `https://example.com/${i}`
                )
            }
            index.start(false)
            index.start(true)
            await waitForSearchIndex(index)
            assert.equal(
                sqlite.prepare("SELECT count(*) AS n FROM article_fts").get().n,
                150,
                "start(true) mid-run completes full FTS rebuild"
            )
        } finally {
            index.stop()
            sqlite.close()
        }
        passed.push(
            "Runtime SQLite safety: live FTS5 content/note/delete triggers, safe regex UDF guard, and mid-run SearchIndex full rebuild"
        )
    })

    {
        const sqlite = createTestDb()
        const {
            exportLibraryData,
            clearLibraryData,
            restoreLibraryData,
        } = require(path.join(appRoot, "src/main/library-backup.ts"))
        try {
            sqlite
                .prepare(
                    "INSERT INTO sources (sid,url,name,lastFetched) VALUES (1,'https://example.com/rss','Ex',0)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO items (_id,source,title,link,date,fetchedDate,content,snippet) VALUES (1,1,'Title','https://example.com/1',100,100,'<p>x</p>','x')"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO article_folders (id,parentId,name,position) VALUES (10,NULL,'RootFolder',0)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO article_folders (id,parentId,name,position) VALUES (2,10,'ChildFolder',0)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO folder_articles (folderId,itemId,stamp) VALUES (2,1,'2026-11-27')"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO article_content (itemId,fullHtml,fullText,fullFetchedAt,offlinePath,offlineText) VALUES (1,'<p>Full</p>','Full',123,'C:\\\\Users\\\\local\\\\1.html','Offline')"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO briefings (id,createdAt,content,tokens) VALUES (1,999,'# Daily Briefing',42)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO ai_cache (key,itemId,kind,result,createdAt,tokens) VALUES ('k1',1,'summary','cached',100,10)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO ai_usage (createdAt,kind,model,input,output) VALUES (100,'summary','gpt',5,5)"
                )
                .run()
            sqlite
                .prepare(
                    "INSERT INTO source_health (sid,failures,lastError,checkedAt,redirect) VALUES (1,2,'boom',100,'')"
                )
                .run()

            const exported = exportLibraryData(sqlite)
            assert.equal(exported.briefings.length, 1)
            assert.equal(exported.article_content[0].offlinePath, "")

            clearLibraryData(sqlite)
            for (const tbl of [
                "article_folders",
                "folder_articles",
                "article_content",
                "briefings",
                "ai_cache",
                "ai_usage",
                "source_health",
            ]) {
                assert.equal(
                    sqlite.prepare(`SELECT count(*) AS n FROM ${tbl}`).get().n,
                    0,
                    `${tbl} cleared by clearLibraryData`
                )
            }

            restoreLibraryData(sqlite, {
                ...exported,
                article_folders: [...exported.article_folders].sort(
                    (a, b) => a.id - b.id
                ),
                article_content: [
                    {
                        ...exported.article_content[0],
                        offlinePath: "D:\\\\foreign\\\\evil.html",
                    },
                ],
            })
            assert.equal(
                sqlite.prepare("SELECT count(*) AS n FROM briefings").get().n,
                1
            )
            assert.equal(
                sqlite
                    .prepare("SELECT count(*) AS n FROM article_folders")
                    .get().n,
                2,
                "child-with-lower-id restores cleanly after parent ordering"
            )
            assert.equal(
                sqlite
                    .prepare(
                        "SELECT offlinePath FROM article_content WHERE itemId=1"
                    )
                    .get().offlinePath,
                "",
                "portable restore clears machine-specific offlinePath"
            )
        } finally {
            sqlite.close()
        }
        passed.push(
            "Portable library backup: briefings round-trip, parent-before-child folder order, offlinePath sanitization, and clearLibraryData hygiene"
        )
    }

    await withMockElectron(async () => {
        const {
            applyPendingRestore,
            sha256,
            validateOfflineEntries,
        } = require(path.join(appRoot, "src/main/restore.ts"))
        const { PersonalPreferencesStore } = require(path.join(
            appRoot,
            "src/main/personal-preferences.ts"
        ))
        const { defaultPersonalSettings } = require(path.join(
            appRoot,
            "src/personal-types.ts"
        ))

        for (const bad of [
            [
                {
                    itemId: 1,
                    entry: "offline/1.html",
                    relative: ["..", "d", "f.html"],
                },
            ],
            [
                {
                    itemId: 1,
                    entry: "offline/1.html",
                    relative: ["src", "2026-11-27", "CON.html"],
                },
            ],
            [
                {
                    itemId: 1,
                    entry: "offline/1.html",
                    relative: ["src", "2026\\11", "a.html"],
                },
            ],
        ]) {
            assert.throws(() => validateOfflineEntries(bad), /Unsafe/)
        }

        const sqliteMem = createTestDb()
        try {
            const prefStore = new PersonalPreferencesStore(
                sqliteMem,
                makeStore(),
                () => {}
            )
            const insideAppDir = path.join(
                path.dirname(process.execPath),
                "sub-backups"
            )
            assert.throws(
                () =>
                    prefStore.saveSettings({
                        ...defaultPersonalSettings,
                        backupFolder: insideAppDir,
                    }),
                /application directory/
            )
            assert.throws(
                () =>
                    prefStore.saveSettings({
                        ...defaultPersonalSettings,
                        offlineFolder: insideAppDir,
                    }),
                /application directory/
            )
        } finally {
            sqliteMem.close()
        }

        const tmpRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "fr-restore-pos-")
        )
        try {
            const pendingDir = path.join(tmpRoot, "pending-restore")
            const customOfflineDir = path.join(tmpRoot, "restored-offline")
            fs.mkdirSync(path.join(pendingDir, "offline"), { recursive: true })

            const stagedDbPath = path.join(pendingDir, "fluent-reader.db")
            const stagedDb = new Database(stagedDbPath)
            try {
                stagedDb.function("html_text", html => String(html || ""))
                migrate(drizzle(stagedDb), {
                    migrationsFolder: path.join(appRoot, "dist/drizzle"),
                })
                stagedDb
                    .prepare(
                        "INSERT INTO sources (sid,url,name,lastFetched) VALUES (1,'https://example.com/rss','Ex',0)"
                    )
                    .run()
                stagedDb
                    .prepare(
                        "INSERT INTO items (_id,source,title,link,date,fetchedDate,content,snippet) VALUES (1,1,'One','https://example.com/1',1,1,'a','a'),(2,1,'Two','https://example.com/2',2,2,'b','b')"
                    )
                    .run()
                stagedDb
                    .prepare(
                        "INSERT INTO article_content (itemId,fullHtml,fullText,fullFetchedAt,offlinePath,offlineText) VALUES (1,'','a',1,'D:\\\\old\\\\1.html','a'),(2,'','b',2,'D:\\\\old\\\\missing-2.html','b')"
                    )
                    .run()
            } finally {
                stagedDb.close()
            }

            const cfgJson = JSON.stringify({
                personal: { offlineFolder: customOfflineDir },
            })
            const offlineHtml = "<!doctype html><title>Saved 1</title>"
            fs.writeFileSync(path.join(pendingDir, "config.json"), cfgJson)
            fs.writeFileSync(
                path.join(pendingDir, "offline/1.html"),
                offlineHtml
            )
            const dbBytes = fs.readFileSync(stagedDbPath)
            fs.writeFileSync(
                path.join(pendingDir, "manifest.json"),
                JSON.stringify({
                    hashes: {
                        "config.json": sha256(cfgJson),
                        "fluent-reader.db": sha256(dbBytes),
                        "offline/1.html": sha256(offlineHtml),
                    },
                    offline: [
                        {
                            itemId: 1,
                            entry: "offline/1.html",
                            relative: ["Ex", "2026-11-27", "One.html"],
                        },
                    ],
                })
            )

            applyPendingRestore(tmpRoot)

            const checkDb = new Database(path.join(tmpRoot, "fluent-reader.db"))
            try {
                const rows = checkDb
                    .prepare(
                        "SELECT itemId, offlinePath FROM article_content ORDER BY itemId"
                    )
                    .all()
                assert.equal(fs.existsSync(rows[0].offlinePath), true)
                assert.ok(
                    rows[0].offlinePath.endsWith(
                        path.join("Ex", "2026-11-27", "One.html")
                    )
                )
                assert.equal(
                    rows[1].offlinePath,
                    "",
                    "stale offlinePath missing from archive cleared to empty string"
                )
            } finally {
                checkDb.close()
            }
        } finally {
            fs.rmSync(tmpRoot, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 50,
            })
        }
        passed.push(
            "Restore & path safety: offline path traversal/reserved-name block, app-dir folder block, and applyPendingRestore offlinePath rewrite + stale cleanup"
        )
    })

    {
        const {
            assertSafeTargetUrl,
            assertAllowedCrossTarget,
            shouldIncludeCredentials,
            fetchWithSafeRedirects,
        } = require(path.join(appRoot, "src/main/net-guard.ts"))
        const {
            isTrustedMainFrame,
            assertTrustedMainFrame,
        } = require(path.join(appRoot, "src/main/ipc-guard.ts"))
        const { DomainQueue, RequestError } = require(path.join(
            appRoot,
            "src/main/domain-queue.ts"
        ))

        assert.throws(() => assertSafeTargetUrl(new URL("http://0.0.0.0/")))
        assert.throws(() =>
            assertSafeTargetUrl(new URL("http://169.254.169.254/latest"))
        )
        assert.throws(() =>
            assertAllowedCrossTarget(
                new URL("https://news.example.com/post"),
                new URL("http://127.0.0.1:8080/admin")
            )
        )
        assert.throws(() =>
            assertAllowedCrossTarget(
                new URL("https://news.example.com/post"),
                new URL("http://192.168.1.10/router")
            )
        )
        assert.doesNotThrow(() =>
            assertAllowedCrossTarget(
                new URL("http://192.168.1.20/rss"),
                new URL("http://192.168.1.30/img.png")
            )
        )
        assert.throws(() =>
            assertAllowedCrossTarget(
                new URL("http://192.168.1.20/rss"),
                new URL("http://127.0.0.1:11434/api")
            )
        )

        assert.equal(
            shouldIncludeCredentials(
                "https://linux.do/t/1",
                "https://cdn.linux.do/a.png"
            ),
            true
        )
        assert.equal(
            shouldIncludeCredentials(
                "https://linux.do/t/1",
                "http://linux.do/downgrade.png"
            ),
            false,
            "HTTPS -> HTTP downgrade drops credentials"
        )
        assert.equal(
            shouldIncludeCredentials(
                "https://alice.github.io/post",
                "https://bob.github.io/pixel.png"
            ),
            false,
            "shared public suffix tenants do not share credentials"
        )
        assert.equal(
            shouldIncludeCredentials(
                "https://linux.do/t/1",
                "https://tracker.evil.example/p.png"
            ),
            false
        )

        const seenCalls = []
        const res = await fetchWithSafeRedirects(
            async (url, init) => {
                seenCalls.push({ url, credentials: init.credentials })
                if (seenCalls.length === 1) {
                    return new Response("", {
                        status: 302,
                        headers: {
                            location: "https://other.example.org/final",
                        },
                    })
                }
                return new Response("ok", { status: 200 })
            },
            "https://origin.example.com/start",
            { credentials: "include" }
        )
        assert.equal(res.finalUrl, "https://other.example.org/final")
        assert.deepEqual(seenCalls, [
            {
                url: "https://origin.example.com/start",
                credentials: "include",
            },
            {
                url: "https://other.example.org/final",
                credentials: "omit",
            },
        ])
        await assert.rejects(
            fetchWithSafeRedirects(
                async () =>
                    new Response("", {
                        status: 302,
                        headers: { location: "http://127.0.0.1:9000/secret" },
                    }),
                "https://origin.example.com/start"
            ),
            /安全限制/
        )

        const mainFrame = { id: "main-frame" }
        const mainContents = {
            mainFrame,
            isDestroyed: () => false,
        }
        const manager = {
            hasWindow: () => true,
            mainWindow: { webContents: mainContents },
        }
        assert.equal(
            isTrustedMainFrame(
                { sender: mainContents, senderFrame: mainFrame },
                manager
            ),
            true
        )
        assert.throws(
            () =>
                assertTrustedMainFrame(
                    { sender: mainContents, senderFrame: { id: "subframe" } },
                    manager
                ),
            /Untrusted IPC sender/
        )
        assert.throws(
            () =>
                assertTrustedMainFrame(
                    { sender: { mainFrame }, senderFrame: mainFrame },
                    manager
                ),
            /Untrusted IPC sender/
        )

        const queue = new DomainQueue(() => ({
            domainInterval: 0,
            concurrency: 4,
        }))
        try {
            let activeSameHost = 0
            let maxSameHost = 0
            await Promise.all([
                queue.add("https://same.example.com/1", "t1", async () => {
                    activeSameHost++
                    maxSameHost = Math.max(maxSameHost, activeSameHost)
                    await new Promise(r => setTimeout(r, 25))
                    activeSameHost--
                }),
                queue.add("https://same.example.com/2", "t2", async () => {
                    activeSameHost++
                    maxSameHost = Math.max(maxSameHost, activeSameHost)
                    await new Promise(r => setTimeout(r, 10))
                    activeSameHost--
                }),
            ])
            assert.equal(
                maxSameHost,
                1,
                "DomainQueue serializes in-flight tasks per host"
            )
            await assert.rejects(
                queue.add("https://rate.example.com/1", "429", async () => {
                    throw new RequestError(429, "1", "Too Many Requests")
                }),
                /Too Many Requests/
            )
            assert.equal(queue.summary().failed, 1)
        } finally {
            queue.close()
        }
        passed.push(
            "Security & scheduler guards: PNA/SSRF + cross-site credential stripping, main-frame IPC sender guard, and per-host DomainQueue serialization/429"
        )
    }

    console.log(`PASS (${passed.length}/${passed.length}):`)
    for (const item of passed) console.log(" -", item)
}

main().catch(err => {
    console.error(err)
    process.exitCode = 1
})
