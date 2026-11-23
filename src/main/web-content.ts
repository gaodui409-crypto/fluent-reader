import { BrowserWindow, session } from "electron"
import { parseHTML } from "linkedom"
import { Readability } from "@mozilla/readability"
import sanitizeHtml from "sanitize-html"
import Mercury from "@jocmp/mercury-parser"
import type Database from "better-sqlite3"
import type { SourcePreferences } from "../source-preferences"
import { DomainQueue, httpURL, RequestError } from "./domain-queue"
import { forumBody } from "../forum"
import type {
    ExtractionPreview,
    FullArticle,
    PersonalSettings,
    SiteExtractionRule,
} from "../personal-types"

export const WEB_PARTITION = "persist:sandbox"
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const SAFE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,120}$/
const SAFE_HASH_HREF_PATTERN = /^#[A-Za-z][A-Za-z0-9_.:-]{0,120}$/

export function htmlText(html: string): string {
    const { document } = parseHTML(`<html><body>${html || ""}</body></html>`)
    document
        .querySelectorAll("script,style,noscript")
        .forEach(el => el.remove())
    return document.body.textContent.replace(/\s+/g, " ").trim()
}

export function validateCssSelector(selector: string, label: string) {
    const trimmed = String(selector || "").trim()
    if (!trimmed) return ""
    try {
        const { document } = parseHTML("<html><body><div></div></body></html>")
        document.querySelectorAll(trimmed)
        return trimmed
    } catch {
        throw new Error(`${label}格式有误，请检查 CSS 选择器写法。`)
    }
}

export function cleanHTML(html: string, url: string): string {
    return sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            "img",
            "figure",
            "figcaption",
            "video",
            "audio",
            "source",
            "details",
            "summary",
        ]),
        allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            "*": [
                ...(sanitizeHtml.defaults.allowedAttributes["*"] || []),
                "id",
            ],
            "img": ["src", "alt", "width", "height"],
            "video": ["src", "controls", "poster"],
            "audio": ["src", "controls"],
            "source": ["src", "type"],
            "details": ["open"],
            "code": ["class"],
            "blockquote": ["cite"],
        },
        allowedSchemes: ["https", "http", "data"],
        allowedSchemesByTag: { a: ["https", "http", "mailto"] },
        transformTags: {
            "*": (tagName, attribs) => {
                if (
                    attribs.id !== undefined &&
                    !SAFE_ID_PATTERN.test(attribs.id)
                ) {
                    delete attribs.id
                }
                for (const key of ["src", "href", "poster"]) {
                    if (attribs[key]) {
                        if (
                            key === "href" &&
                            SAFE_HASH_HREF_PATTERN.test(attribs[key])
                        ) {
                            continue
                        }
                        try {
                            attribs[key] = new URL(attribs[key], url).href
                        } catch {
                            delete attribs[key]
                        }
                    }
                }
                return { tagName, attribs }
            },
        },
    })
}

export function secureWebWindow(show = false, preload?: string) {
    const win = new BrowserWindow({
        show,
        width: 1100,
        height: 800,
        webPreferences: {
            partition: WEB_PARTITION,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            spellcheck: false,
            preload,
        },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    win.webContents.on("will-navigate", (event, url) => {
        try {
            httpURL(url)
        } catch {
            event.preventDefault()
        }
    })
    return win
}

export async function renderedPage<T>(
    url: string,
    consume: (win: BrowserWindow) => Promise<T>,
    preload?: string,
    timeoutMs = 60000
): Promise<T> {
    httpURL(url)
    const win = secureWebWindow(false, preload)
    let responseCode = 200
    win.webContents.on("did-navigate", (_, __, status) => {
        responseCode = status
    })
    const requests = new Set<string>()
    let lastActivity = Date.now()
    const timeout = setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
    }, timeoutMs)
    try {
        win.webContents.debugger.attach("1.3")
        win.webContents.debugger.on("message", (_, method, params) => {
            if (method === "Network.requestWillBeSent") {
                requests.add(params.requestId)
                lastActivity = Date.now()
            } else if (
                ["Network.loadingFinished", "Network.loadingFailed"].includes(
                    method
                )
            ) {
                requests.delete(params.requestId)
                lastActivity = Date.now()
            }
        })
        // A newly created hidden window has no renderer target until navigation
        // starts. Waiting for Network.enable first can deadlock that first load.
        const loading = win.loadURL(url)
        await Promise.all([
            loading,
            win.webContents.debugger.sendCommand("Network.enable"),
        ])
        if (responseCode >= 400) throw new RequestError(responseCode)
        const deadline = Date.now() + 12000
        while (
            (requests.size > 0 || Date.now() - lastActivity < 750) &&
            Date.now() < deadline
        )
            await wait(150)
        clearTimeout(timeout)
        if (win.isDestroyed() || win.webContents.isDestroyed())
            throw new Error("页面加载超时。")
        return await consume(win)
    } finally {
        clearTimeout(timeout)
        if (!win.isDestroyed()) win.destroy()
    }
}

export async function responseHTML(
    response: Response,
    allowJSON = false
): Promise<string> {
    if (!response.ok)
        throw new RequestError(
            response.status,
            response.headers.get("retry-after")
        )
    const type = response.headers.get("content-type") || ""
    if (
        type &&
        !/html|xml|text/i.test(type) &&
        !(allowJSON && /\bjson\b/i.test(type))
    )
        throw new Error("该网址返回的不是网页或文本内容。")
    if (!response.body) return ""
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 16 * 1024 * 1024) {
            await reader.cancel()
            throw new Error("网页内容超过 16 MB 上限。")
        }
        chunks.push(value)
    }
    const bytes = Buffer.concat(chunks)
    const encoding =
        type.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
        bytes
            .subarray(0, 2048)
            .toString("ascii")
            .match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
        "utf-8"
    try {
        return new TextDecoder(encoding).decode(bytes)
    } catch {
        return bytes.toString("utf8")
    }
}

function extractDocumentTitle(rawHtml: string, fallback: string): string {
    try {
        const { document } = parseHTML(rawHtml)
        const metaTitle = document
            .querySelector(
                'meta[property="og:title"], meta[name="twitter:title"]'
            )
            ?.getAttribute("content")
            ?.replace(/\s+/g, " ")
            .trim()
        if (metaTitle) return metaTitle
        const titleEl = document
            .querySelector("title")
            ?.textContent?.replace(/\s+/g, " ")
            .trim()
        if (titleEl) return titleEl
        const h1 = document
            .querySelector("h1")
            ?.textContent?.replace(/\s+/g, " ")
            .trim()
        if (h1) return h1
    } catch {
        // Ignore title parse failure and use fallback.
    }
    return fallback
}

export async function extractArticle(
    html: string,
    url: string,
    rule?: SiteExtractionRule
) {
    const { document } = parseHTML(html)
    document.querySelectorAll("img").forEach(img => {
        const lazy =
            img.getAttribute("data-src") || img.getAttribute("data-original")
        if (lazy) img.setAttribute("src", lazy)
    })
    if (rule?.remove) {
        try {
            document.querySelectorAll(rule.remove).forEach(el => el.remove())
        } catch {
            throw new Error("网站提取规则的移除元素选择器语法有误。")
        }
    }
    const base = document.createElement("base")
    base.href = url
    document.head.prepend(base)
    let content = ""
    if (rule?.container) {
        let container: Element | null = null
        try {
            container = document.querySelector(rule.container)
        } catch {
            throw new Error("网站提取规则的正文区域选择器语法有误。")
        }
        if (!container)
            throw new Error(
                "未在页面中找到匹配该站正文区域规则的内容，请检查 CSS 选择器或登录状态。"
            )
        content = container.innerHTML
    } else {
        const forum = forumBody(document as unknown as Document, url)
        if (forum !== null) {
            content = forum
        } else {
            try {
                content =
                    (
                        await Mercury.parse(url, {
                            html: document.toString(),
                            fetchAllPages: false,
                        })
                    ).content || ""
            } catch {
                /* Readability fallback below. */
            }
            if (htmlText(content).length < 100) {
                const readable = new Readability(
                    document as unknown as Document,
                    {
                        charThreshold: 0,
                    }
                ).parse()
                if (
                    readable?.content &&
                    htmlText(readable.content).length > htmlText(content).length
                )
                    content = readable.content
            }
        }
    }
    if (!htmlText(content))
        throw new Error(
            "未能提取出正文内容。可尝试改用「网页渲染后提取」、配置正文区域规则，或先登录该网站。"
        )
    return cleanHTML(content, url)
}

export class FullText {
    private pending = new Map<number, Promise<FullArticle>>()
    constructor(
        private sqlite: Database.Database,
        private queue: DomainQueue,
        private settings: () => PersonalSettings,
        private sourcePreferences?: (sid: number) => SourcePreferences,
        private updated?: () => void
    ) {}

    private async fetchDirectHTML(href: string): Promise<string> {
        const doFetch =
            session && typeof session.fromPartition === "function"
                ? (url: string, init: RequestInit) =>
                      session.fromPartition(WEB_PARTITION).fetch(url, init)
                : globalThis.fetch
        return responseHTML(
            await doFetch(href, {
                credentials: "include",
                signal: AbortSignal.timeout(30000),
            })
        )
    }

    async preview(
        address: string,
        overrideRule?: Partial<SiteExtractionRule>
    ): Promise<ExtractionPreview> {
        const trimmed = String(address || "").trim()
        if (!trimmed) throw new Error("请输入要测试预览的文章网址。")
        const url = httpURL(
            trimmed.includes("://") ? trimmed : "https://" + trimmed
        )
        const savedRule = this.settings().siteRules.find(
            rule => rule.host.toLowerCase() === url.hostname.toLowerCase()
        )
        const requestedMode = overrideRule?.mode ?? savedRule?.mode ?? "direct"
        if (overrideRule?.mode === "off") {
            throw new Error(
                "当前规则模式为关闭抓取，请切换为直接抓取或网页渲染后再测试预览。"
            )
        }
        const effectiveRule: SiteExtractionRule = {
            host: url.hostname.toLowerCase(),
            container:
                overrideRule?.container !== undefined
                    ? validateCssSelector(
                          String(overrideRule.container || "").slice(0, 2000),
                          "正文选择器"
                      )
                    : savedRule?.container || "",
            remove:
                overrideRule?.remove !== undefined
                    ? validateCssSelector(
                          String(overrideRule.remove || "").slice(0, 2000),
                          "移除元素选择器"
                      )
                    : savedRule?.remove || "",
            mode: requestedMode === "rendered" ? "rendered" : "direct",
        }

        return this.queue.add(url.href, "previewExtraction", async () => {
            const raw =
                effectiveRule.mode === "rendered"
                    ? await renderedPage(url.href, win =>
                          win.webContents.executeJavaScript(
                              "document.documentElement.outerHTML"
                          )
                      )
                    : await this.fetchDirectHTML(url.href)
            const title = extractDocumentTitle(raw, url.hostname)
            const html = await extractArticle(raw, url.href, effectiveRule)
            return {
                title,
                html,
                textLength: htmlText(html).length,
            }
        })
    }

    async get(
        id: number,
        force = false,
        mode?: "direct" | "rendered",
        collectionOverride = false
    ): Promise<FullArticle> {
        const existing = this.pending.get(id)
        if (existing) return existing
        const cached = this.sqlite
            .prepare(
                "SELECT fullHtml,fullFetchedAt FROM article_content WHERE itemId=?"
            )
            .get(id) as { fullHtml: string; fullFetchedAt: number }
        if (cached?.fullHtml && !force)
            return {
                html: cached.fullHtml,
                fetchedAt: cached.fullFetchedAt,
                cached: true,
            }
        const item = this.sqlite
            .prepare("SELECT link,source FROM items WHERE _id=?")
            .get(id) as { link: string; source: number }
        if (!item) throw new Error("文章已不存在。")
        const preferences = this.sourcePreferences?.(item.source)
        if (preferences?.fetchMode === "off" && !collectionOverride)
            throw new Error(
                "Full text fetching is disabled for this subscription."
            )
        const url = httpURL(item.link)
        const rule = this.settings().siteRules.find(
            rule => rule.host.toLowerCase() === url.hostname.toLowerCase()
        )
        if (rule?.mode === "off")
            throw new Error("该网站已在提取规则中关闭全文抓取。")
        const promise = this.queue.add(url.href, "fullText", async () => {
            const rendered =
                (mode || rule?.mode || preferences?.fetchMode) === "rendered"
            const raw = rendered
                ? await renderedPage(url.href, win =>
                      win.webContents.executeJavaScript(
                          "document.documentElement.outerHTML"
                      )
                  )
                : await this.fetchDirectHTML(url.href)
            const html = await extractArticle(raw, url.href, rule)
            const fetchedAt = Date.now()
            if (
                this.sqlite.prepare("SELECT 1 FROM items WHERE _id=?").get(id)
            ) {
                this.sqlite
                    .prepare(
                        `INSERT INTO article_content(itemId,fullHtml,fullText,fullFetchedAt) VALUES(?,?,?,?)
                    ON CONFLICT(itemId) DO UPDATE SET fullHtml=excluded.fullHtml,fullText=excluded.fullText,fullFetchedAt=excluded.fullFetchedAt`
                    )
                    .run(id, html, htmlText(html), fetchedAt)
            }
            this.updated?.()
            return { html, fetchedAt, cached: false }
        })
        this.pending.set(id, promise)
        try {
            return await promise
        } finally {
            this.pending.delete(id)
        }
    }
}

export { FullText as WebContentService }
