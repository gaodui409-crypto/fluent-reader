export const LINUXDO = "https://linux.do"
export type LinuxDoChoice = {
    title: string
    url: string
    restricted?: boolean
    parentId?: number
}
export type LinuxDoAccount = {
    loggedIn: boolean
    username?: string
    level?: number
    categories: LinuxDoChoice[]
    topicCount: number
    restrictedTopicCount: number
}
export function isLinuxDo(address: string): boolean {
    try {
        const url = new URL(address)
        return (
            url.protocol === "https:" &&
            url.hostname === "linux.do" &&
            !url.port &&
            !url.username &&
            !url.password
        )
    } catch {
        return false
    }
}
export const linuxDoPresets: LinuxDoChoice[] = [
    { title: "最新主题", url: LINUXDO + "/latest.rss" },
    { title: "最新回复", url: LINUXDO + "/posts.rss" },
    { title: "今日热门", url: LINUXDO + "/top.rss?period=daily" },
    {
        title: "每小时热门榜单",
        url: LINUXDO + "/top.rss?period=daily#fluent-ranking",
    },
    ...[
        ["开发调优", "develop", 4],
        ["资源荟萃", "resource", 14],
        ["前沿快讯", "news", 34],
        ["福利羊毛", "welfare", 36],
        ["国产替代", "domestic", 98],
        ["搞七捻三", "gossip", 11],
    ].map(([title, slug, id]) => ({
        title: String(title),
        url: `${LINUXDO}/c/${slug}/${id}.rss`,
    })),
]
export const linuxDoTags: LinuxDoChoice[] = [
    { title: "人工智能", url: LINUXDO + "/tag/444-tag/444.rss" },
    { title: "开源推广", url: LINUXDO + "/tag/2234-tag/2234.rss" },
    { title: "精华神帖", url: LINUXDO + "/tag/1435-tag/1435.rss" },
    { title: "抽奖", url: LINUXDO + "/tag/lottery/10.rss" },
]
export function categoryChoices(data: any): LinuxDoChoice[] {
    const rows = data?.category_list?.categories ?? data?.categories
    if (!Array.isArray(rows))
        throw new Error("网站没有返回分类列表，请登录后重试。")
    return rows
        .filter(
            c =>
                Number.isSafeInteger(c.id) &&
                c.id > 0 &&
                typeof c.name === "string"
        )
        .map(c => ({
            title: c.name,
            url: `${LINUXDO}/c/${encodeURIComponent(c.slug || "category")}/${
                c.id
            }.rss`,
            restricted: c.read_restricted === true,
            parentId: c.parent_category_id,
        }))
}
export function tagChoices(data: any): LinuxDoChoice[] {
    const rows = data?.results ?? data?.tags
    if (!Array.isArray(rows))
        throw new Error("网站没有返回标签列表，请打开标签页面后重试。")
    return rows
        .filter(t => typeof t.name === "string")
        .map(t => ({
            title: t.text || t.name,
            url: Number.isSafeInteger(t.id)
                ? `${LINUXDO}/tag/${encodeURIComponent(t.slug || t.name)}/${
                      t.id
                  }.rss`
                : `${LINUXDO}/tag/${encodeURIComponent(t.name)}.rss`,
        }))
}
export function linuxDoJSONPath(address: string): string | null {
    if (!isLinuxDo(address)) return null
    const u = new URL(address)
    if (u.search || u.hash) return null
    return /^\/(?:latest|c\/[^/]+\/\d+|tag\/[^/]+(?:\/\d+)?)\.json$/.test(
        u.pathname
    )
        ? u.pathname
        : null
}
export function accountFeed(choice: LinuxDoChoice): LinuxDoChoice {
    return { ...choice, url: choice.url.replace(/\.rss$/, ".json") }
}
const escapeXML = (value: unknown) =>
    String(value ?? "").replace(
        /[<>&"']/g,
        c =>
            ({
                "<": "&lt;",
                ">": "&gt;",
                "&": "&amp;",
                '"': "&quot;",
                "'": "&apos;",
            }[c])
    )
function rss(title: string, url: string, entries: string[]) {
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${escapeXML(
        title
    )}</title><link>${escapeXML(
        url
    )}</link><description>LINUX DO</description>${entries.join(
        ""
    )}</channel></rss>`
}
export function topicRSS(data: any, url: string, title: string): string {
    if (!Array.isArray(data?.topic_list?.topics))
        throw new Error("网站没有返回主题列表，请检查登录状态。")
    const users = new Map((data.users || []).map(u => [u.id, u.username]))
    return rss(
        title,
        url,
        data.topic_list.topics
            .filter(t => Number.isSafeInteger(t.id) && t.id > 0)
            .map(t => {
                const link = `${LINUXDO}/t/topic/${t.id}/1`
                const content = `<p>${escapeXML(
                    t.excerpt || ""
                )}</p><p>以上为主题摘要，点击顶部「抓取全文」即可直接阅读主楼完整内容。</p><p><a href="${link}">打开原帖</a></p>`
                const author = users.get(
                    t.posters?.find(p =>
                        /Original Poster/.test(p.description || "")
                    )?.user_id
                )
                const date = Date.parse(t.created_at)
                return `<item><guid isPermaLink="false">linux.do:topic:${
                    t.id
                }:post:1</guid><title>${escapeXML(
                    t.title
                )}</title><link>${link}</link>${
                    Number.isFinite(date)
                        ? `<pubDate>${new Date(date).toUTCString()}</pubDate>`
                        : ""
                }<dc:creator>${escapeXML(author)}</dc:creator>${(t.tags || [])
                    .map(
                        t =>
                            `<category>${escapeXML(
                                typeof t === "string" ? t : t.name
                            )}</category>`
                    )
                    .join("")}<description>${escapeXML(
                    content
                )}</description></item>`
            })
    )
}
export type RankingState = {
    hour: number
    signature: string
    links: string[]
    entries: string[]
    xml: string
}
export function rankingRSS(
    items: { link?: string; title?: string; creator?: string }[],
    address: string,
    previous?: RankingState,
    now = Date.now()
): RankingState {
    const hour = Math.floor(now / 3600000)
    const seen = new Set<string>()
    const rows = items
        .filter(
            i =>
                isLinuxDo(i.link || "") &&
                !seen.has(i.link) &&
                !!seen.add(i.link)
        )
        .slice(0, 50)
    if (!rows.length) throw new Error("热门订阅没有返回主题，保留已有榜单。")
    const links = rows.map(r => r.link),
        signature = JSON.stringify(links)
    if (
        previous &&
        (previous.hour === hour || previous.signature === signature)
    )
        return previous
    const body = `<h2>热门主题</h2><p>按热门源当前顺序排列，名次升降对比上一期本地榜单（注：数字为帖子热度排名，非论坛账号等级）。</p><ol>${rows
        .map((r, i) => {
            const old = previous?.links.indexOf(r.link) ?? -1
            const delta =
                old < 0
                    ? "新上榜"
                    : old === i
                    ? "持平"
                    : old > i
                    ? `上升 ${old - i}`
                    : `下降 ${i - old}`
            return `<li><p><a href="${escapeXML(r.link)}">${escapeXML(
                r.title
            )}</a> · ${delta}</p></li>`
        })
        .join("")}</ol>`
    const entry = `<item><guid isPermaLink="false">linuxdo-ranking:${hour}</guid><title>${escapeXML(
        new Date(hour * 3600000).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
        })
    )} 热门榜单</title><link>${escapeXML(address)}</link><pubDate>${new Date(
        hour * 3600000
    ).toUTCString()}</pubDate><description>${escapeXML(
        body
    )}</description></item>`
    const entries = [entry, ...(previous?.entries || [])].slice(0, 24)
    return {
        hour,
        signature,
        links,
        entries,
        xml: rss("LINUX DO · 每小时热门榜单", address, entries),
    }
}
