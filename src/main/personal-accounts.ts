import { session } from "electron"
import { httpURL, normalizeSiteHost } from "./domain-queue"
import { secureWebWindow, WEB_PARTITION } from "./web-content"

export function lockWebPartitionPermissions() {
    const web = session.fromPartition(WEB_PARTITION)
    web.setPermissionRequestHandler((_, __, callback) => callback(false))
    web.setPermissionCheckHandler(() => false)
}

export async function listWebAccounts(): Promise<
    { host: string; count: number }[]
> {
    const cookies = await session.fromPartition(WEB_PARTITION).cookies.get({})
    const counts = new Map<string, number>()
    cookies.forEach(cookie => {
        const host = cookie.domain.replace(/^\./, "")
        counts.set(host, (counts.get(host) || 0) + 1)
    })
    return [...counts]
        .map(([host, count]) => ({ host, count }))
        .sort((a, b) => a.host.localeCompare(b.host))
}

export async function clearWebAccount(host: string): Promise<boolean> {
    const target = normalizeSiteHost(host)
    const web = session.fromPartition(WEB_PARTITION)
    const cookies = await web.cookies.get({})
    for (const cookie of cookies.filter(
        c => c.domain.replace(/^\./, "") === target
    )) {
        await web.cookies.remove(
            `${cookie.secure ? "https" : "http"}://${target}${cookie.path}`,
            cookie.name
        )
    }
    for (const protocol of ["https:", "http:"])
        await web.clearStorageData({
            origin: `${protocol}//${target}`,
            storages: [
                "localstorage",
                "indexdb",
                "serviceworkers",
                "cachestorage",
            ],
        })
    await web.cookies.flushStore()
    return true
}

export async function openWebLoginWindow(address: string): Promise<boolean> {
    const trimmed = String(address || "").trim()
    if (!trimmed) throw new Error("请输入要登录的网站地址。")
    const url = httpURL(
        trimmed.includes("://") ? trimmed : "https://" + trimmed
    )
    const win = secureWebWindow(true)
    win.on("closed", () => {
        void session
            .fromPartition(WEB_PARTITION)
            .cookies.flushStore()
            .catch(err => console.warn("Cookie store flush warning:", err))
    })
    await win.loadURL(url.origin)
    return true
}
