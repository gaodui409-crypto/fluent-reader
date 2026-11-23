import { BrowserWindow } from "electron"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import type { ForumFloor } from "../personal-types"
import { DomainQueue, RequestError } from "./domain-queue"
import { cleanHTML, secureWebWindow } from "./web-content"
import {
    LINUXDO,
    isLinuxDo,
    categoryChoices,
    tagChoices,
    topicRSS,
    LinuxDoAccount,
    RankingState,
    rankingRSS,
} from "../linuxdo"
import Parser from "rss-parser"

export class LinuxDo {
    private browser: BrowserWindow | null = null
    private starting: Promise<BrowserWindow> | null = null
    private needsVerification = false
    private cache = new Map<string, { expires: number; value: unknown }>()
    constructor(
        private queue: DomainQueue,
        private store: Store<SchemaTypes>,
        private request: (url: string) => Promise<{ text: string }>
    ) {}

    private window(): Promise<BrowserWindow> {
        if (this.starting) return this.starting
        if (this.browser && !this.browser.isDestroyed())
            return Promise.resolve(this.browser)
        const win = secureWebWindow(false)
        this.browser = win
        win.setTitle("LINUX DO · 账号登录")
        win.on("closed", () => {
            if (this.browser === win) this.browser = null
            this.cache.clear()
        })
        this.starting = (async () => {
            const timeout = setTimeout(() => {
                if (!win.isDestroyed()) win.destroy()
            }, 25000)
            try {
                await win.loadURL(LINUXDO)
                if (win.isDestroyed())
                    throw new Error("Linux.do 登录窗口在加载完成前已关闭。")
                return win
            } finally {
                clearTimeout(timeout)
                this.starting = null
            }
        })()
        return this.starting
    }

    async open() {
        this.needsVerification = false
        this.cache.clear()
        const pending = this.window()
        if (this.browser && !this.browser.isDestroyed()) this.browser.show()
        const win = await pending
        if (!win.isDestroyed()) {
            win.show()
            win.focus()
        }
        return true
    }

    close() {
        if (this.browser && !this.browser.isDestroyed()) this.browser.close()
        this.cache.clear()
    }

    private ensureAlive(win: BrowserWindow) {
        if (!win || win.isDestroyed() || win.webContents?.isDestroyed?.()) {
            throw new Error("Linux.do 连接窗口已关闭，请重试。")
        }
    }

    private async json(path: string): Promise<any> {
        if (this.needsVerification)
            throw new Error(
                "Linux.do 需要人机验证或重新登录，已暂停自动请求。请先打开登录窗口完成验证，再点击检查连接。"
            )
        const address = new URL(path, LINUXDO)
        if (
            address.origin !== LINUXDO ||
            !/^\/(?:session\/current|site|categories|tags(?:\/filter\/search)?|latest|t\/\d+|c\/[^/]+\/\d+|tag\/[^/]+(?:\/\d+)?)\.json$/.test(
                address.pathname
            ) ||
            (address.search &&
                (address.pathname !== "/tags/filter/search.json" ||
                    [...address.searchParams.keys()].some(k => k !== "q"))) ||
            address.hash
        )
            throw new Error("不支持的 Linux.do 数据地址。")
        return this.queue.add(address.href, "linuxdo", async () => {
            try {
                const response = await this.request(address.href)
                return JSON.parse(response.text)
            } catch (e) {
                const shouldTryBrowser =
                    (e instanceof RequestError &&
                        [401, 403].includes(e.status)) ||
                    e instanceof SyntaxError
                if (!shouldTryBrowser) throw e
            }
            const win = await this.window()
            this.ensureAlive(win)
            let currentOrigin = ""
            try {
                currentOrigin = new URL(win.webContents.getURL()).origin
            } catch {
                currentOrigin = ""
            }
            if (currentOrigin !== LINUXDO)
                throw new Error(
                    "请先在打开的网站窗口完成登录，再点击检查连接。"
                )
            const challenge = await win.webContents.executeJavaScript(
                `!!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-running, #challenge-form') || /^(请稍候|Just a moment|Checking your browser)/i.test(document.title)`,
                false
            )
            if (challenge) {
                this.needsVerification = true
                throw new Error(
                    "内嵌窗口停留在 Cloudflare 安全验证页，已暂停自动请求。请打开登录窗口完成验证；若反复被拦，可改用系统浏览器阅读。"
                )
            }
            this.ensureAlive(win)
            const result = await win.webContents.executeJavaScript(
                `(async()=>{
                if(location.origin !== 'https://linux.do')throw Error('Please finish login first');
                const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
                try { const response=await fetch(${JSON.stringify(
                    address.pathname + address.search
                )}, {credentials:'include', redirect:'error', headers:{Accept:'application/json'},signal:controller.signal});
                    const text=await response.text(); if(text.length>8000000)throw Error('Response too large'); return {status:response.status,text,retry:response.headers.get('Retry-After')};
                }finally{clearTimeout(timer)}
            })()`,
                false
            )
            if ([401, 403].includes(result.status))
                this.needsVerification = true
            if (result.status >= 400)
                throw new RequestError(result.status, result.retry)
            try {
                return JSON.parse(result.text)
            } catch {
                this.needsVerification = true
                throw new Error(
                    "网站尚未返回有效数据，请打开 Linux.do 登录窗口完成登录或安全验证后重试。"
                )
            }
        })
    }

    async replies(url: string): Promise<ForumFloor[]> {
        const raw = String(url || "").trim()
        if (!isLinuxDo(raw)) {
            throw new Error("仅支持读取 Linux.do 帖子评论。")
        }
        const parsed = new URL(raw)
        const match = /\/t\/(?:[^/]+\/)?(\d+)/.exec(parsed.pathname)
        if (!match) {
            throw new Error("无法从帖子链接中解析话题编号。")
        }
        const topicId = match[1]
        const data = await this.json(`/t/${topicId}.json`)
        const posts = Array.isArray(data?.post_stream?.posts)
            ? data.post_stream.posts
            : []
        return posts
            .filter(
                (p: any) =>
                    p && typeof p.post_number === "number" && p.post_number > 1
            )
            .slice(0, 30)
            .map(
                (p: any): ForumFloor => ({
                    floor: p.post_number,
                    author: String(p.name || p.username || ""),
                    createdAt: String(p.created_at || ""),
                    html: cleanHTML(String(p.cooked || ""), LINUXDO),
                    likes: Number(
                        p.actions_summary?.find((a: any) => a?.id === 2)
                            ?.count ||
                            p.like_count ||
                            0
                    ),
                })
            )
    }

    async catalog(kind: "categories" | "tags", query = "") {
        if (!["categories", "tags"].includes(kind))
            throw new Error("无效的目录类型。")
        const term = String(query).trim().toLocaleLowerCase().slice(0, 100)
        const key = kind + ":" + term,
            cached = this.cache.get(key)
        let choices =
            cached && cached.expires > Date.now()
                ? (cached.value as ReturnType<typeof categoryChoices>)
                : null
        if (!choices) {
            const data = await this.json(
                kind === "categories"
                    ? "/site.json"
                    : term
                    ? "/tags/filter/search.json?q=" + encodeURIComponent(term)
                    : "/tags.json"
            )
            choices =
                kind === "categories" ? categoryChoices(data) : tagChoices(data)
            if (this.cache.size >= 50)
                this.cache.delete(this.cache.keys().next().value)
            this.cache.set(key, {
                expires: Date.now() + 300000,
                value: choices,
            })
        }
        return choices
            .filter(
                c =>
                    !term ||
                    c.title.toLocaleLowerCase().includes(term) ||
                    c.url.toLocaleLowerCase().includes(encodeURIComponent(term))
            )
            .slice(0, 100)
    }

    async account(): Promise<LinuxDoAccount> {
        // Only this user-invoked check retries a paused account connection.
        this.needsVerification = false
        this.cache.clear()
        const data = await this.json("/session/current.json")
        const user = data?.current_user
        if (!user || typeof user.username !== "string")
            return {
                loggedIn: false,
                categories: [],
                topicCount: 0,
                restrictedTopicCount: 0,
            }
        const categories = categoryChoices(await this.json("/site.json"))
        const latest = await this.json("/latest.json")
        if (!Array.isArray(latest?.topic_list?.topics))
            throw new Error("已登录，但未能获取到最新话题列表。")
        const restricted = new Set(
            categories
                .filter(c => c.restricted)
                .map(c => Number(c.url.match(/\/(\d+)\.rss$/)?.[1]))
        )
        return {
            loggedIn: true,
            username: user.username,
            level: Number.isInteger(user.trust_level)
                ? user.trust_level
                : undefined,
            categories,
            topicCount: latest.topic_list.topics.length,
            restrictedTopicCount: latest.topic_list.topics.filter(t =>
                restricted.has(t.category_id)
            ).length,
        }
    }

    async feed(path: string) {
        const account = await this.json("/session/current.json")
        if (!account?.current_user?.username)
            throw new Error(
                "此 Linux.do 订阅需要登录状态，请在账号连接窗口重新登录。"
            )
        const data = await this.json(path)
        return topicRSS(data, LINUXDO + path, "LINUX DO · 账号主题")
    }

    async ranking(address: string) {
        const text = await this.queue.add(
            address,
            "linuxdo-ranking",
            async () => (await this.request(address)).text
        )
        const feed = await new Parser().parseString(text)
        const previous = this.store.get("linuxDoRanking") as
            | RankingState
            | undefined
        const result = rankingRSS(feed.items, address, previous)
        if (result !== previous) this.store.set("linuxDoRanking", result)
        return result.xml
    }
}
