import { session } from "electron"
import type { WebAccountInfo } from "../personal-types"
import { httpURL, normalizeSiteHost } from "./domain-queue"
import { secureWebWindow, WEB_PARTITION } from "./web-content"

export function normalizeAccountHost(input: string): string {
    return normalizeSiteHost(input)
        .replace(/^\.+/, "")
        .replace(/^www\./i, "")
}

function cleanDomain(raw: string): string {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/^\.+/, "")
        .replace(/^www\./, "")
}

function isRegistrableDomain(domain: string): boolean {
    const parts = domain.split(".").filter(Boolean)
    if (parts.length < 2) return false
    if (
        parts.length === 2 &&
        /^(?:com|net|org|gov|edu|co|ac)$/i.test(parts[0]) &&
        parts[1].length === 2
    ) {
        return false
    }
    return true
}

function domainsMatch(cookieDomain: string, targetHost: string): boolean {
    if (!cookieDomain || !targetHost) return false
    if (cookieDomain === targetHost) return true
    if (
        isRegistrableDomain(targetHost) &&
        cookieDomain.endsWith("." + targetHost)
    ) {
        return true
    }
    if (
        isRegistrableDomain(cookieDomain) &&
        targetHost.endsWith("." + cookieDomain)
    ) {
        return true
    }
    return false
}

export function enrichWebAccounts(
    accounts: { host: string; count: number }[],
    loginHosts: string[] = [],
    sourceUrls: string[] = []
): WebAccountInfo[] {
    const explicitHosts = loginHosts
        .map(h => {
            try {
                return normalizeAccountHost(h)
            } catch {
                return cleanDomain(h)
            }
        })
        .filter(Boolean)

    const subscribedHosts = sourceUrls
        .map(url => {
            try {
                return cleanDomain(new URL(url).hostname)
            } catch {
                return ""
            }
        })
        .filter(Boolean)

    return accounts
        .map(acc => {
            const normalized = cleanDomain(acc.host)
            const explicit = explicitHosts.some(lh =>
                domainsMatch(normalized, lh)
            )
            const subscribed = subscribedHosts.some(sh =>
                domainsMatch(normalized, sh)
            )
            return {
                host: acc.host,
                count: acc.count,
                explicit,
                subscribed,
            }
        })
        .sort((a, b) => {
            if (Boolean(a.explicit) !== Boolean(b.explicit)) {
                return a.explicit ? -1 : 1
            }
            if (Boolean(a.subscribed) !== Boolean(b.subscribed)) {
                return a.subscribed ? -1 : 1
            }
            if (b.count !== a.count) {
                return b.count - a.count
            }
            return a.host.localeCompare(b.host)
        })
}

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

export async function openWebLoginWindow(
    address: string,
    onClosed?: () => void
): Promise<boolean> {
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
            .finally(() => {
                onClosed?.()
            })
    })
    await win.loadURL(url.origin)
    return true
}

export { openWebLoginWindow as openAccountLoginWindow }
