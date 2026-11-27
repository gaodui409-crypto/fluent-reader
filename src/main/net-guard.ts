import * as net from "node:net"
import { httpURL } from "./domain-queue"

// Common multi-label public suffixes so fallback same-site checks never equate
// sibling tenants on shared suffixes when globalThis.Origin is unavailable.
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "com.cn",
    "net.cn",
    "org.cn",
    "gov.cn",
    "edu.cn",
    "com.hk",
    "com.tw",
    "co.jp",
    "ne.jp",
    "or.jp",
    "com.au",
    "net.au",
    "org.au",
    "co.kr",
    "co.in",
    "com.br",
    "com.sg",
    "github.io",
    "gitlab.io",
    "pages.dev",
    "workers.dev",
    "vercel.app",
    "netlify.app",
    "web.app",
    "firebaseapp.com",
])

function stripIpv6Brackets(hostname: string): string {
    return hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname
}

export function classifyHostAddress(
    rawHostname: string
): "public" | "private" | "loopback" | "blocked" {
    const host = stripIpv6Brackets(
        String(rawHostname || "")
            .trim()
            .toLowerCase()
    )
    if (!host) return "blocked"
    if (host === "localhost" || host.endsWith(".localhost")) return "loopback"

    const ipVersion = net.isIP(host)
    if (ipVersion === 4) {
        const parts = host.split(".").map(Number)
        const [a, b] = parts
        // 0.0.0.0/8 (unspecified) & 169.254.0.0/16 (link-local / cloud metadata)
        if (a === 0 || (a === 169 && b === 254)) return "blocked"
        // 127.0.0.0/8 loopback
        if (a === 127) return "loopback"
        // RFC1918 + CGNAT 100.64.0.0/10
        if (
            a === 10 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127)
        ) {
            return "private"
        }
        return "public"
    }

    if (ipVersion === 6) {
        if (host === "::" || host === "0:0:0:0:0:0:0:0") return "blocked"
        if (host === "::1" || host === "0:0:0:0:0:0:0:1") return "loopback"
        // IPv4-mapped IPv6 ::ffff:a.b.c.d
        if (host.startsWith("::ffff:")) {
            const v4 = host.slice(7)
            if (net.isIP(v4) === 4) return classifyHostAddress(v4)
        }
        // Link-local fe80::/10
        if (/^fe[89ab][0-9a-f]:/.test(host) || host.startsWith("fe80:")) {
            return "blocked"
        }
        // Unique local fc00::/7
        if (host.startsWith("fc") || host.startsWith("fd")) return "private"
        return "public"
    }

    if (host.endsWith(".local") || host.endsWith(".internal")) return "private"
    return "public"
}

export function assertSafeTargetUrl(url: URL): void {
    const kind = classifyHostAddress(url.hostname)
    if (kind === "blocked") {
        throw new Error("出于安全限制，已拦截访问未指定或链路本地保留地址。")
    }
}

/**
 * Enforces Chromium Private Network Access (PNA) boundaries: a public origin
 * cannot subresource-fetch or redirect into loopback or private LAN addresses.
 */
export function assertAllowedCrossTarget(sourceUrl: URL, targetUrl: URL): void {
    assertSafeTargetUrl(targetUrl)
    const sourceKind = classifyHostAddress(sourceUrl.hostname)
    const targetKind = classifyHostAddress(targetUrl.hostname)
    if (sourceKind === "public" && targetKind !== "public") {
        throw new Error("出于安全限制，公网页面不允许访问本地或内网地址。")
    }
    if (sourceKind === "private" && targetKind === "loopback") {
        throw new Error("出于安全限制，内网页面不允许跳转至本机回环地址。")
    }
}

function getRegistrableDomainFallback(hostname: string): string | null {
    const host = stripIpv6Brackets(hostname.toLowerCase().replace(/\.$/, ""))
    if (!host || net.isIP(host) !== 0 || !host.includes(".")) return null
    const labels = host.split(".")
    if (labels.length < 2) return null
    const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`
    if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
        if (labels.length < 3) return null
        return `${labels[labels.length - 3]}.${lastTwo}`
    }
    return lastTwo
}

/**
 * Schemeful same-site check used to decide whether persisted sandbox cookies
 * may accompany subresource requests or HTTP redirects.
 */
export function shouldIncludeCredentials(
    contextHref: string | URL,
    targetHref: string | URL
): boolean {
    try {
        const contextUrl =
            contextHref instanceof URL ? contextHref : new URL(contextHref)
        const targetUrl =
            targetHref instanceof URL ? targetHref : new URL(targetHref)
        if (
            contextUrl.origin === "null" ||
            targetUrl.origin === "null" ||
            (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:")
        ) {
            return false
        }
        // Prevent HTTPS -> HTTP credential downgrade even on the same domain.
        if (contextUrl.protocol !== targetUrl.protocol) {
            return false
        }
        if (contextUrl.origin === targetUrl.origin) {
            return true
        }
        const OriginCtor = (
            globalThis as unknown as {
                Origin?: {
                    from(v: string): { isSameSite(other: unknown): boolean }
                }
            }
        ).Origin
        if (OriginCtor && typeof OriginCtor.from === "function") {
            return OriginCtor.from(targetUrl.href).isSameSite(
                OriginCtor.from(contextUrl.href)
            )
        }
        const contextSite = getRegistrableDomainFallback(contextUrl.hostname)
        const targetSite = getRegistrableDomainFallback(targetUrl.hostname)
        return Boolean(contextSite && targetSite && contextSite === targetSite)
    } catch {
        return false
    }
}

export interface SafeRedirectFetchOptions {
    credentials?: RequestCredentials
    headers?: Record<string, string>
    timeoutMs?: number
    maxRedirects?: number
}

export async function fetchWithSafeRedirects(
    doFetch: (url: string, init: RequestInit) => Promise<Response>,
    initialHref: string,
    options: SafeRedirectFetchOptions = {}
): Promise<{ response: Response; finalUrl: string }> {
    const initialUrl = httpURL(initialHref)
    assertSafeTargetUrl(initialUrl)

    let currentUrl = initialUrl
    let includeCredentials = (options.credentials ?? "include") === "include"
    const maxRedirects = options.maxRedirects ?? 8
    const timeoutMs = options.timeoutMs ?? 30000

    for (let hop = 0; hop <= maxRedirects; hop++) {
        const response = await doFetch(currentUrl.href, {
            credentials: includeCredentials ? "include" : "omit",
            headers: options.headers,
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
        })
        if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.get("location")
        ) {
            if (hop === maxRedirects) {
                throw new Error("Too many redirects.")
            }
            const rawLocation = response.headers.get("location")!
            let nextUrl: URL
            try {
                nextUrl = httpURL(new URL(rawLocation, currentUrl.href).href)
            } catch {
                throw new Error("Invalid URL protocol.")
            }
            assertAllowedCrossTarget(initialUrl, nextUrl)
            if (
                includeCredentials &&
                !shouldIncludeCredentials(initialUrl, nextUrl)
            ) {
                includeCredentials = false
            }
            currentUrl = nextUrl
            continue
        }
        return { response, finalUrl: currentUrl.href }
    }
    throw new Error("Too many redirects.")
}
