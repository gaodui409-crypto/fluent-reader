export function resolveHTTPURL(
    value: unknown,
    base?: string
): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined
    try {
        const url = new URL(value.trim(), base)
        return url.protocol === "https:" || url.protocol === "http:"
            ? url.href
            : undefined
    } catch {
        return undefined
    }
}

export function isDecorativeImage(address: string): boolean {
    try {
        return /\/(?:images\/emoji|emoji|emojis|user_avatar|letter_avatar|avatars?)\//i.test(
            new URL(address).pathname
        )
    } catch {
        return true
    }
}

export function articleCover(
    item: { thumb?: string; content?: string; link: string },
    feedURL?: string
): string | undefined {
    if (!item.thumb || !isDecorativeImage(item.thumb)) return item.thumb
    return findCoverImage({}, item.content || "", item.link, feedURL)
}

type Media = { $?: { url?: string; medium?: string; type?: string } }
type ImageFeedItem = {
    thumb?: string
    image?: string | { $?: { url?: string }; url?: string }
    mediaThumbnails?: Media[]
    mediaContent?: Media[]
    enclosure?: { url?: string; type?: string }
}

function isImage(url: string, type?: string, medium?: string): boolean {
    return (
        medium === "image" ||
        /^image\//i.test(type || "") ||
        (!type && /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url || ""))
    )
}

export function findCoverImage(
    parsed: ImageFeedItem,
    content: string,
    articleURL: string,
    feedURL?: string
): string | undefined {
    const base = resolveHTTPURL(articleURL, feedURL) || resolveHTTPURL(feedURL)
    const candidates: unknown[] = [
        parsed.thumb,
        typeof parsed.image === "string"
            ? parsed.image
            : parsed.image?.$?.url || parsed.image?.url,
        ...(parsed.mediaThumbnails || []).map(image => image.$?.url),
        ...(parsed.mediaContent || [])
            .filter(image =>
                isImage(image.$?.url, image.$?.type, image.$?.medium)
            )
            .map(image => image.$?.url),
    ]
    if (isImage(parsed.enclosure?.url, parsed.enclosure?.type))
        candidates.push(parsed.enclosure.url)
    for (const candidate of candidates) {
        const url = resolveHTTPURL(candidate, base)
        if (url && !isDecorativeImage(url)) return url
    }

    const doc = new DOMParser().parseFromString(content, "text/html")
    for (const img of Array.from(doc.querySelectorAll("img"))) {
        if (/\b(?:emoji|avatar|emoticon)\b/i.test(img.className || "")) continue
        const width = Number(img.getAttribute("width")),
            height = Number(img.getAttribute("height"))
        if (width > 0 && height > 0 && width <= 32 && height <= 32) continue
        // Prefer a lazy-loaded original over a tracking/placeholder src.
        for (const attr of ["data-src", "data-original", "src"]) {
            const url = resolveHTTPURL(img.getAttribute(attr), base)
            if (url && !isDecorativeImage(url)) return url
        }
    }
    return undefined
}
