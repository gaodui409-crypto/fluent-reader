export function forumPost(address: string) {
    try {
        const url = new URL(address)
        if (!["http:", "https:"].includes(url.protocol)) return null
        const match =
            url.pathname.match(/^\/t\/(\d+)(?:\/(\d+))?\/?$/) ||
            url.pathname.match(/^\/t\/[^/]+\/(\d+)(?:\/(\d+))?\/?$/)
        if (!match) return null
        const post = Number(
            url.hash.match(/^#post[_-](\d+)$/)?.[1] || match[2] || 1
        )
        return {
            host: url.hostname.toLowerCase(),
            topic: Number(match[1]),
            post,
        }
    } catch {
        return null
    }
}

// Only apply identity normalization to a verified Discourse host. Titles,
// tracking parameters, renamed slugs and source subscriptions are not IDs.
export function forumKey(address: string): string | null {
    const post = forumPost(address)
    return post?.host === "linux.do"
        ? `${post.host}:topic:${post.topic}:post:${post.post}`
        : null
}

export function forumBody(document: Document, address: string): string | null {
    const post = forumPost(address)
    const discourse =
        post &&
        (post.host === "linux.do" ||
            /discourse/i.test(
                document
                    .querySelector('meta[name="generator"]')
                    ?.getAttribute("content") || ""
            ))
    if (!discourse) return null
    const n = post.post
    const body = document.querySelector(
        `#post_${n} .cooked, #post_${n} [itemprop="articleBody"], [data-post-number="${n}"] .cooked`
    )
    if (body) return body.innerHTML
    // Do not fall through to generic full-page extraction: a login page or a
    // reply loaded midway through the topic is not the requested post.
    throw new Error(
        n === 1
            ? "未找到主题主楼。请在内置网页查看原帖或登录后重试；已保存的正文仍可阅读。"
            : `未找到第 ${n} 楼，请打开原帖查看。不会用主楼或其他回复替代。`
    )
}
