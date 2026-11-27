import { net, session } from "electron"
import { parseHTML } from "linkedom"
import Parser from "rss-parser"
import type Database from "better-sqlite3"
import { DomainQueue, httpURL } from "./domain-queue"
import {
    assertAllowedCrossTarget,
    assertSafeTargetUrl,
    fetchWithSafeRedirects,
    shouldIncludeCredentials,
} from "./net-guard"
import { responseHTML, WEB_PARTITION } from "./web-content"
import type {
    DiscoveredFeed,
    PersonalSettings,
    SourceHealth,
} from "../personal-types"

export class Subscriptions {
    specialFeed?: (address: string) => Promise<string> | null
    private checking: Promise<SourceHealth[]> | null = null
    private discoveries = new Map<
        string,
        { expires: number; feeds: DiscoveredFeed[] }
    >()
    constructor(
        private db: Database.Database,
        private queue: DomainQueue,
        private settings: () => PersonalSettings
    ) {}

    request(
        address: string,
        allowJSON = false
    ): Promise<{ text: string; url: string; permanent: string }> {
        const initialUrl = httpURL(address)
        assertSafeTargetUrl(initialUrl)
        let url = initialUrl.href
        let handedOff = false
        let permanent = "",
            redirects = 0
        return new Promise((resolve, reject) => {
            const request = net.request({
                url,
                credentials: "include",
                session: session.fromPartition(WEB_PARTITION),
                redirect: "manual",
                cache: "no-cache",
            })
            const fail = (error: unknown) => {
                clearTimeout(timer)
                reject(error)
                request.abort()
            }
            const timer = setTimeout(
                () => fail(new Error("订阅源连接超时（超过 30 秒）。")),
                30000
            )
            request.on("error", error => {
                if (handedOff) return
                clearTimeout(timer)
                reject(error)
            })
            request.on("redirect", (status, _, target) => {
                try {
                    if (++redirects > 8)
                        throw new Error("订阅地址跳转次数过多。")
                    const nextUrl = httpURL(new URL(target, url).href)
                    assertAllowedCrossTarget(initialUrl, nextUrl)
                    url = nextUrl.href
                    if (
                        [301, 308].includes(status) &&
                        permanent !== "temporary"
                    )
                        permanent = url
                    else permanent = "temporary"
                    if (!shouldIncludeCredentials(initialUrl, new URL(url))) {
                        handedOff = true
                        clearTimeout(timer)
                        request.abort()
                        void fetchWithSafeRedirects(
                            (u, init) =>
                                session
                                    .fromPartition(WEB_PARTITION)
                                    .fetch(u, init),
                            url,
                            {
                                credentials: "omit",
                                timeoutMs: 30000,
                                maxRedirects: Math.max(0, 8 - redirects),
                            }
                        )
                            .then(async ({ response, finalUrl }) =>
                                resolve({
                                    text: await responseHTML(
                                        response,
                                        allowJSON
                                    ),
                                    url: finalUrl,
                                    permanent:
                                        permanent === "temporary"
                                            ? ""
                                            : finalUrl === url
                                            ? permanent
                                            : "",
                                })
                            )
                            .catch(reject)
                        return
                    }
                    request.followRedirect()
                } catch (error) {
                    fail(error)
                }
            })
            request.on("response", response => {
                const chunks: Buffer[] = []
                let size = 0
                response.on("data", chunk => {
                    size += chunk.length
                    if (size > 16 * 1024 * 1024)
                        fail(new Error("订阅源返回内容超过 16 MB 上限。"))
                    else chunks.push(Buffer.from(chunk))
                })
                response.on("error", fail)
                response.on("aborted", () => {
                    if (!handedOff) fail(new Error("订阅源响应被中断。"))
                })
                response.on("end", () => {
                    clearTimeout(timer)
                    const headers = new Headers()
                    for (const [name, value] of Object.entries(
                        response.headers
                    ))
                        headers.set(
                            name,
                            Array.isArray(value) ? value.join(",") : value
                        )
                    try {
                        const result = new Response(Buffer.concat(chunks), {
                            status: response.statusCode,
                            headers,
                        })
                        void responseHTML(result, allowJSON).then(
                            text =>
                                resolve({
                                    text,
                                    url,
                                    permanent:
                                        permanent === "temporary"
                                            ? ""
                                            : permanent,
                                }),
                            reject
                        )
                    } catch (error) {
                        reject(error)
                    }
                })
            })
            request.end()
        })
    }

    async discover(address: string): Promise<DiscoveredFeed[]> {
        const key = httpURL(address).href
        const cached = this.discoveries.get(key)
        if (cached && cached.expires > Date.now()) return cached.feeds
        const feeds = await this.queue.add(address, "discovery", async () => {
            const page = await this.request(address)
            try {
                const feed = await new Parser().parseString(page.text)
                return [{ url: page.url, title: feed.title || page.url }]
            } catch {
                /* A normal HTML page can advertise one or more feeds. */
            }
            const { document } = parseHTML(page.text)
            let base = page.url
            try {
                const baseHref = document
                    .querySelector("base[href]")
                    ?.getAttribute("href")
                    ?.trim()
                if (baseHref) {
                    base = httpURL(new URL(baseHref, base).href).href
                }
            } catch {
                /* ignore invalid base */
            }
            const found = new Map<string, DiscoveredFeed>()
            for (const link of document.querySelectorAll("link[href]")) {
                const rawHref = (link.getAttribute("href") || "").trim()
                if (
                    !rawHref ||
                    !/\balternate\b/i.test(link.getAttribute("rel") || "") ||
                    !/application\/(rss\+xml|atom\+xml|rdf\+xml)/i.test(
                        link.getAttribute("type") || ""
                    )
                )
                    continue
                try {
                    const url = httpURL(new URL(rawHref, base).href).href
                    found.set(url, {
                        url,
                        title: link.getAttribute("title")?.trim() || url,
                    })
                } catch {
                    /* Ignore unsafe discovery links. */
                }
            }
            return [...found.values()].slice(0, 50)
        })
        if (feeds.length) {
            if (this.discoveries.size >= 100)
                this.discoveries.delete(this.discoveries.keys().next().value)
            this.discoveries.set(key, { expires: Date.now() + 300000, feeds })
        }
        return feeds
    }

    async feed(address: string): Promise<string> {
        const special = this.specialFeed?.(address)
        if (special) return special
        return this.queue.add(
            address,
            "subscription",
            async () => (await this.request(address)).text
        )
    }

    report(sid: number, error = "", redirect?: string) {
        if (
            !Number.isSafeInteger(sid) ||
            !this.db.prepare("SELECT sid FROM sources WHERE sid=?").get(sid)
        )
            return false
        const previous = this.db
            .prepare("SELECT redirect FROM source_health WHERE sid=?")
            .get(sid) as { redirect: string } | undefined
        this.db
            .prepare(
                `INSERT INTO source_health(sid,failures,lastError,checkedAt,redirect) VALUES(?,?,?,?,?)
            ON CONFLICT(sid) DO UPDATE SET failures=CASE WHEN excluded.failures=0 THEN 0 ELSE source_health.failures+1 END,
            lastError=excluded.lastError,checkedAt=excluded.checkedAt,redirect=excluded.redirect`
            )
            .run(
                sid,
                error ? 1 : 0,
                String(error).slice(0, 500),
                Date.now(),
                redirect ?? previous?.redirect ?? ""
            )
        return true
    }

    opened(id: number) {
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章编号。")
        this.db
            .prepare(
                "INSERT INTO article_activity(itemId,openedAt) SELECT _id,? FROM items WHERE _id=? ON CONFLICT(itemId) DO UPDATE SET openedAt=excluded.openedAt"
            )
            .run(Date.now(), id)
        return true
    }

    health(): SourceHealth[] {
        const cutoff = Date.now() - 30 * 86400000
        const staleCutoff = Date.now() - this.settings().staleDays * 86400000
        const rows = this.db
            .prepare(
                `SELECT s.sid,s.name,s.url,s.serviceRef,s.lastFetched,
            COALESCE(h.failures,0) failures,COALESCE(h.lastError,'') lastError,COALESCE(h.checkedAt,0) checkedAt,COALESCE(h.redirect,'') redirect,
            COALESCE(MAX(i.date),0) latest,
            COUNT(CASE WHEN i.date>=? THEN 1 END) updates,
            COUNT(CASE WHEN i.date>=? AND a.openedAt>=? THEN 1 END) opened
            FROM sources s LEFT JOIN source_health h ON h.sid=s.sid LEFT JOIN items i ON i.source=s.sid
            LEFT JOIN article_activity a ON a.itemId=i._id WHERE s.archived=0 GROUP BY s.sid ORDER BY failures DESC,s.name`
            )
            .all(cutoff, cutoff, cutoff) as (SourceHealth & {
            serviceRef: string
        })[]
        return rows.map(row => ({
            ...row,
            stale: row.latest < staleCutoff,
            service: !!row.serviceRef,
        }))
    }

    check() {
        if (this.checking) return this.checking
        this.checking = Promise.all(
            this.health()
                .filter(s => !s.service)
                .map(async source => {
                    try {
                        const special = this.specialFeed?.(source.url)
                        if (special) {
                            await new Parser().parseString(await special)
                            this.report(source.sid)
                        } else {
                            await this.queue.add(
                                source.url,
                                "health",
                                async () => {
                                    const page = await this.request(source.url)
                                    await new Parser().parseString(page.text)
                                    this.report(source.sid, "", page.permanent)
                                }
                            )
                        }
                    } catch (error) {
                        this.report(source.sid, String(error))
                    }
                })
        )
            .then(() => this.health())
            .finally(() => {
                this.checking = null
            })
        return this.checking
    }

    applyRedirect(sid: number) {
        if (!Number.isSafeInteger(sid)) throw new Error("无效的订阅源。")
        const source = this.db
            .prepare(
                "SELECT s.sid,s.serviceRef,COALESCE(h.redirect,'') AS redirect FROM sources s LEFT JOIN source_health h ON h.sid=s.sid WHERE s.sid=? AND s.archived=0"
            )
            .get(sid) as
            | { sid: number; serviceRef: string | null; redirect: string }
            | undefined
        if (!source || !source.redirect || source.serviceRef)
            throw new Error("该订阅源当前没有可更新的永久跳转地址。")
        const url = httpURL(source.redirect).href
        const collision = this.db
            .prepare("SELECT sid,archived FROM sources WHERE url=? AND sid<>?")
            .get(url, sid) as { sid: number; archived: number } | undefined
        if (collision && !collision.archived) {
            throw new Error("该跳转地址已存在于当前订阅列表中。")
        }
        this.db.transaction(() => {
            if (collision && collision.archived) {
                this.db
                    .prepare("UPDATE items SET source=? WHERE source=?")
                    .run(sid, collision.sid)
                this.db
                    .prepare("DELETE FROM source_health WHERE sid=?")
                    .run(collision.sid)
                this.db
                    .prepare("DELETE FROM sources WHERE sid=?")
                    .run(collision.sid)
            }
            this.db
                .prepare("UPDATE sources SET url=? WHERE sid=?")
                .run(url, sid)
            this.db
                .prepare("UPDATE source_health SET redirect='' WHERE sid=?")
                .run(sid)
        })()
        return url
    }
}
