function getParam(name) {
    const match = new RegExp(
        "[?&]" + encodeURIComponent(name) + "=([^&]*)"
    ).exec(location.search)
    return match ? decodeURIComponent(match[1]) : ""
}

let wheelBound = false
function applyStyle(opts) {
    if (!opts) return
    if (typeof opts.dark === "boolean") {
        const scheme = opts.dark ? "dark" : "light"
        document.documentElement.dataset.theme = scheme
        document.documentElement.style.colorScheme = scheme
    }
    if (opts.locale) {
        document.documentElement.lang = String(opts.locale)
    }
    if (opts.fontSize) {
        document.documentElement.style.fontSize = Number(opts.fontSize) + "px"
    }
    document.body.style.fontFamily = opts.fontFamily
        ? `"${String(opts.fontFamily).replace(/"/g, "")}", "Segoe UI", "Source Han Sans SC Regular", "Microsoft YaHei", sans-serif`
        : ""
    document.body.classList.remove("rtl", "vertical")
    const dir = String(opts.dir ?? "")
    if (dir === "1") {
        document.body.classList.add("rtl")
    } else if (dir === "2") {
        document.body.classList.add("vertical")
        if (!wheelBound) {
            wheelBound = true
            document.body.addEventListener(
                "wheel",
                evt => {
                    if (
                        document.body.classList.contains("vertical") &&
                        document.scrollingElement
                    ) {
                        document.scrollingElement.scrollLeft -= evt.deltaY
                    }
                },
                { passive: true }
            )
        }
    }
}

function resolveAttrUrl(raw, baseUrl) {
    if (!raw) return ""
    try {
        return baseUrl ? new URL(raw, baseUrl).href : new URL(raw).href
    } catch {
        return ""
    }
}

function sanitizeAndMount(title, dateText, articleHtml, rawUrl) {
    const domParser = new DOMParser()
    const dom = domParser.parseFromString(
        "<article></article>",
        "text/html"
    )
    const articleEl = dom.querySelector("article")
    articleEl.innerHTML = articleHtml || ""

    let originBase = ""
    try {
        const parsed = new URL(rawUrl)
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            originBase = parsed.href
        }
    } catch {
        originBase = ""
    }

    for (const s of Array.from(
        dom.querySelectorAll("script, style, object, embed, base, meta, link")
    )) {
        s.remove()
    }
    if (originBase) {
        const baseEl = dom.createElement("base")
        baseEl.setAttribute("href", originBase)
        dom.head.append(baseEl)
    }
    for (const el of Array.from(dom.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
            if (/^on/i.test(attr.name)) {
                el.removeAttribute(attr.name)
            }
        }
    }
    for (const e of Array.from(dom.querySelectorAll("[src]"))) {
        const resolved = resolveAttrUrl(e.getAttribute("src"), originBase)
        if (resolved && /^(https?:|data:)/i.test(resolved)) {
            e.setAttribute("src", resolved)
        } else {
            e.removeAttribute("src")
        }
        if (e.tagName === "IMG") {
            e.setAttribute("loading", "lazy")
            e.setAttribute("decoding", "async")
        }
    }
    for (const e of Array.from(dom.querySelectorAll("[poster]"))) {
        const resolved = resolveAttrUrl(e.getAttribute("poster"), originBase)
        if (resolved && /^https?:/i.test(resolved)) {
            e.setAttribute("poster", resolved)
        } else {
            e.removeAttribute("poster")
        }
    }
    for (const e of Array.from(dom.querySelectorAll("[srcset]"))) {
        const rawSrcset = e.getAttribute("srcset") || ""
        const rewritten = rawSrcset
            .split(",")
            .map(part => {
                const tokens = part.trim().split(/\s+/)
                if (!tokens[0]) return ""
                const url = resolveAttrUrl(tokens[0], originBase)
                if (!url || !/^(https?:|data:)/i.test(url)) return ""
                return [url, ...tokens.slice(1)].join(" ")
            })
            .filter(Boolean)
            .join(", ")
        if (rewritten) e.setAttribute("srcset", rewritten)
        else e.removeAttribute("srcset")
    }
    for (const e of Array.from(dom.querySelectorAll("[href]"))) {
        const resolved = resolveAttrUrl(e.getAttribute("href"), originBase)
        if (resolved && /^(https?:|mailto:)/i.test(resolved)) {
            e.setAttribute("href", resolved)
        } else {
            e.removeAttribute("href")
        }
    }

    const main = document.getElementById("main")
    main.textContent = ""

    const titleEl = document.createElement("h1")
    titleEl.className = "title"
    titleEl.textContent = title || ""

    const dateEl = document.createElement("p")
    dateEl.className = "date"
    dateEl.textContent = dateText || ""

    main.append(titleEl, dateEl, articleEl)
    main.classList.add("show")

    const scroller = document.scrollingElement || document.documentElement
    if (scroller) {
        scroller.scrollTop = 0
        scroller.scrollLeft = 0
    }
}

window.__updateArticleStyle = applyStyle

window.__renderArticle = function (payload) {
    if (!payload) return
    applyStyle(payload)
    sanitizeAndMount(
        payload.title,
        payload.dateText,
        payload.html,
        payload.url
    )
}

window.__scrollArticleBy = function (ratio) {
    const el = document.scrollingElement || document.documentElement
    if (!el) return
    if (document.body.classList.contains("vertical")) {
        el.scrollBy({
            left: -window.innerWidth * ratio,
            behavior: "smooth",
        })
    } else {
        el.scrollBy({
            top: window.innerHeight * ratio,
            behavior: "smooth",
        })
    }
}

// Legacy query-string fallback if opened directly with ?a=...
const legacyHtml = getParam("a")
const legacyHeader = getParam("h")
if (legacyHtml || legacyHeader) {
    applyStyle({
        fontSize: getParam("s") || 16,
        fontFamily: getParam("f"),
        dir: getParam("d"),
    })
    const headerDoc = new DOMParser().parseFromString(
        legacyHeader,
        "text/html"
    )
    sanitizeAndMount(
        headerDoc.querySelector(".title")?.textContent || "",
        headerDoc.querySelector(".date")?.textContent || "",
        legacyHtml,
        getParam("u")
    )
}
