import type { QueueTask } from "../personal-types"

export class RequestError extends Error {
    retryMs: number
    constructor(public status: number, retryAfter?: string) {
        super(
            status === 429
                ? "HTTP 429：网站暂时限制请求，已暂停此站点队列，稍后可重试。"
                : status === 401 || status === 403
                ? `HTTP ${status}：网站拒绝访问或需要登录。可在内置网页登录后重试，已保存内容仍可阅读。`
                : `HTTP ${status}`
        )
        const seconds = Number(retryAfter)
        const delay = retryAfter
            ? Number.isFinite(seconds)
                ? seconds * 1000
                : Date.parse(retryAfter) - Date.now()
            : 60000
        this.retryMs = Math.min(
            900000,
            Math.max(1000, Number.isFinite(delay) ? delay : 60000)
        )
    }
}

export function httpURL(value: string): URL {
    const url = new URL(value)
    if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
    )
        throw new Error(
            "Only HTTP(S) addresses without embedded credentials are supported."
        )
    return url
}

/** Every background page visit enters this scheduler, including rendered visits. */
export class DomainQueue {
    private nextId = 0
    private active = 0
    private activeHosts = new Set<string>()
    private lastFinished = new Map<string, number>()
    private backoffUntil = new Map<string, number>()
    private pending: { task: QueueTask; run: () => Promise<void> }[] = []
    private history: QueueTask[] = []
    private timer: ReturnType<typeof setTimeout>

    constructor(
        private config: () => { domainInterval: number; concurrency: number }
    ) {}

    snapshot(): QueueTask[] {
        return this.history.map(task => ({ ...task }))
    }

    add<T>(address: string, label: string, work: () => Promise<T>): Promise<T> {
        const host = httpURL(address).hostname.toLowerCase()
        const task: QueueTask = {
            id: ++this.nextId,
            label,
            host,
            state: "waiting",
        }
        this.history = this.history.filter(
            t =>
                t.state === "waiting" ||
                t.state === "running" ||
                t.id > this.nextId - 100
        )
        this.history.push(task)
        return new Promise((resolve, reject) => {
            this.pending.push({
                task,
                run: async () => {
                    try {
                        const value = await work()
                        task.state = "done"
                        resolve(value)
                    } catch (error) {
                        if (
                            error instanceof RequestError &&
                            error.status === 429
                        )
                            this.backoffUntil.set(
                                host,
                                Date.now() + error.retryMs
                            )
                        task.state = "failed"
                        task.error = String(error).slice(0, 500)
                        reject(error)
                    }
                },
            })
            this.pump()
        })
    }

    private pump() {
        clearTimeout(this.timer)
        const config = this.config()
        const interval = Math.max(0, config.domainInterval) * 1000
        const concurrency = Math.max(1, Math.min(8, config.concurrency))
        let delay = Infinity
        while (this.active < concurrency) {
            const now = Date.now()
            const index = this.pending.findIndex(({ task }) => {
                if (this.activeHosts.has(task.host)) return false
                const wait =
                    Math.max(
                        (this.lastFinished.get(task.host) || 0) + interval,
                        this.backoffUntil.get(task.host) || 0
                    ) - now
                if (wait > 0) {
                    delay = Math.min(delay, wait)
                    return false
                }
                return true
            })
            if (index < 0) break
            const { task, run } = this.pending.splice(index, 1)[0]
            this.active++
            this.activeHosts.add(task.host)
            task.state = "running"
            void run().finally(() => {
                this.active--
                this.activeHosts.delete(task.host)
                this.lastFinished.set(task.host, Date.now())
                this.pump()
            })
        }
        if (Number.isFinite(delay))
            this.timer = setTimeout(() => this.pump(), Math.max(1, delay))
    }
}
