function getParam(name) {
    const match = new RegExp(
        "[?&]" + encodeURIComponent(name) + "=([^&]*)"
    ).exec(location.search)
    return match ? decodeURIComponent(match[1]) : ""
}

const ALLOWED_ATTRS = new Set([
    "id",
    "class",
    "title",
    "lang",
    "dir",
    "href",
    "src",
    "srcset",
    "sizes",
    "alt",
    "width",
    "height",
    "poster",
    "controls",
    "preload",
    "loop",
    "muted",
    "playsinline",
    "colspan",
    "rowspan",
    "headers",
    "scope",
    "start",
    "reversed",
    "type",
    "open",
    "cite",
    "datetime",
    "abbr",
    "aria-label",
    "aria-hidden",
    "role",
    "loading",
    "decoding",
    "data-lang",
])

const RESERVED_CLASS_PREFIX_RE = /^(?:lightbox|code|toc|reply|replies)(?:-|$)/i

const RESERVED_IDS = new Set([
    "main",
    "content",
    "progress",
    "replies",
    "lightbox",
    "lightbox-counter",
    "lightbox-reset",
    "lightbox-close",
    "lightbox-stage",
    "lightbox-prev",
    "lightbox-next",
    "lightbox-img",
])

const VALID_ID_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,120}$/
const IMAGE_HREF_RE = /\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#].*)?$/i

let wheelBound = false
let currentOriginUrl = ""
let codeBlockCounter = 0
let currentRenderEpoch = 0

function resolveWidthCh(mode) {
    if (mode === "narrow") return "60ch"
    if (mode === "wide") return "88ch"
    return "68ch"
}

function updateScrollProgress() {
    const bar = document.getElementById("progress")
    if (!bar) return
    const scroller = document.scrollingElement || document.documentElement
    if (!scroller) return
    let ratio = 0
    let scrollable = 0
    if (document.body.classList.contains("vertical")) {
        scrollable = scroller.scrollWidth - scroller.clientWidth
        if (scrollable > 60) {
            ratio = Math.min(
                1,
                Math.max(0, Math.abs(scroller.scrollLeft) / scrollable)
            )
        }
    } else {
        scrollable = scroller.scrollHeight - scroller.clientHeight
        if (scrollable > 60) {
            ratio = Math.min(1, Math.max(0, scroller.scrollTop / scrollable))
        }
    }
    bar.style.opacity = scrollable > 60 ? "0.85" : "0"
    bar.style.transform = `scaleX(${ratio.toFixed(4)})`
}

window.addEventListener("scroll", updateScrollProgress, { passive: true })
window.addEventListener("resize", updateScrollProgress, { passive: true })

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
    if (opts.readerWidth) {
        document.documentElement.style.setProperty(
            "--reader-width",
            resolveWidthCh(opts.readerWidth)
        )
    }
    if (
        typeof opts.lineHeight === "number" &&
        Number.isFinite(opts.lineHeight) &&
        opts.lineHeight >= 1.2 &&
        opts.lineHeight <= 2.8
    ) {
        document.documentElement.style.setProperty(
            "--reader-line-height",
            String(opts.lineHeight)
        )
    }
    document.body.style.fontFamily = opts.fontFamily
        ? `"${String(opts.fontFamily).replace(
              /"/g,
              ""
          )}", "Segoe UI", "Source Han Sans SC Regular", "Microsoft YaHei", sans-serif`
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
                        document.scrollingElement &&
                        !document.getElementById("lightbox")?.open
                    ) {
                        document.scrollingElement.scrollLeft -= evt.deltaY
                    }
                },
                { passive: true }
            )
        }
    }
    requestAnimationFrame(updateScrollProgress)
}

function resolveAttrUrl(raw, baseUrl) {
    if (!raw) return ""
    try {
        return baseUrl ? new URL(raw, baseUrl).href : new URL(raw).href
    } catch {
        return ""
    }
}

function parseOriginBase(rawUrl) {
    try {
        const parsed = new URL(rawUrl)
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href
        }
    } catch {
        return ""
    }
    return ""
}

function sanitizeFragment(htmlString, rawUrl, tagName = "div") {
    const domParser = new DOMParser()
    const dom = domParser.parseFromString(
        `<${tagName}></${tagName}>`,
        "text/html"
    )
    const rootEl = dom.body.firstElementChild
    rootEl.innerHTML = htmlString || ""

    const originBase = parseOriginBase(rawUrl)

    for (const frame of Array.from(rootEl.querySelectorAll("iframe, frame"))) {
        const frameSrc =
            frame.tagName === "IFRAME"
                ? resolveAttrUrl(frame.getAttribute("src"), originBase)
                : ""
        if (frameSrc && /^https?:/i.test(frameSrc)) {
            const p = dom.createElement("p")
            const link = dom.createElement("a")
            link.setAttribute("href", frameSrc)
            link.setAttribute("rel", "noopener noreferrer")
            const label = (frame.getAttribute("title") || "").trim()
            link.textContent = label
                ? `打开嵌入内容：${label}`
                : `打开嵌入内容（${frameSrc}）`
            p.append(link)
            frame.replaceWith(p)
        } else {
            frame.remove()
        }
    }

    for (const s of Array.from(
        rootEl.querySelectorAll(
            "script, style, object, embed, base, meta, link, form, input, button, textarea, select"
        )
    )) {
        s.remove()
    }

    for (const el of Array.from(rootEl.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase()
            if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) {
                el.removeAttribute(attr.name)
                continue
            }
            if (name === "id") {
                const val = attr.value.trim()
                if (!VALID_ID_RE.test(val) || RESERVED_IDS.has(val)) {
                    el.removeAttribute(attr.name)
                } else if (val !== attr.value) {
                    el.setAttribute("id", val)
                }
            } else if (name === "class") {
                const safeTokens = attr.value
                    .split(/\s+/)
                    .filter(t => t && !RESERVED_CLASS_PREFIX_RE.test(t))
                if (safeTokens.length > 0) {
                    el.setAttribute("class", safeTokens.join(" "))
                } else {
                    el.removeAttribute(attr.name)
                }
            }
        }
    }

    for (const e of Array.from(rootEl.querySelectorAll("[src]"))) {
        const resolved = resolveAttrUrl(e.getAttribute("src"), originBase)
        const allowDataImg =
            e.tagName === "IMG" && /^data:image\//i.test(resolved)
        if (resolved && (/^https?:/i.test(resolved) || allowDataImg)) {
            e.setAttribute("src", resolved)
        } else {
            e.removeAttribute("src")
        }
        if (e.tagName === "IMG") {
            e.setAttribute("loading", "lazy")
            e.setAttribute("decoding", "async")
        }
    }

    for (const e of Array.from(rootEl.querySelectorAll("[poster]"))) {
        const resolved = resolveAttrUrl(e.getAttribute("poster"), originBase)
        if (resolved && /^https?:/i.test(resolved)) {
            e.setAttribute("poster", resolved)
        } else {
            e.removeAttribute("poster")
        }
    }

    for (const e of Array.from(rootEl.querySelectorAll("[srcset]"))) {
        const rawSrcset = e.getAttribute("srcset") || ""
        const rewritten = rawSrcset
            .split(",")
            .map(part => {
                const tokens = part.trim().split(/\s+/)
                if (!tokens[0]) return ""
                const url = resolveAttrUrl(tokens[0], originBase)
                const allowDataSrcset =
                    e.tagName === "IMG" && /^data:image\//i.test(url)
                if (!url || !(/^https?:/i.test(url) || allowDataSrcset))
                    return ""
                return [url, ...tokens.slice(1)].join(" ")
            })
            .filter(Boolean)
            .join(", ")
        if (rewritten) e.setAttribute("srcset", rewritten)
        else e.removeAttribute("srcset")
    }

    for (const e of Array.from(rootEl.querySelectorAll("[href]"))) {
        const rawHref = (e.getAttribute("href") || "").trim()
        if (rawHref.startsWith("#") && rawHref.length > 1) {
            e.setAttribute("href", rawHref)
            continue
        }
        const resolved = resolveAttrUrl(rawHref, originBase)
        if (resolved && /^(https?:|mailto:)/i.test(resolved)) {
            e.setAttribute("href", resolved)
        } else {
            e.removeAttribute("href")
        }
    }

    return rootEl
}

function detectCodeLanguage(preEl) {
    const codeEl = preEl.querySelector("code")
    const candidates = [
        codeEl?.getAttribute("data-lang") || "",
        preEl.getAttribute("data-lang") || "",
        codeEl?.className || "",
        preEl.className || "",
    ]
    for (const c of candidates) {
        if (!c) continue
        const match = /(?:^|\s)(?:language|lang)-([A-Za-z0-9_+#.-]+)/i.exec(c)
        if (match) return match[1].toLowerCase()
    }
    const direct = (
        codeEl?.getAttribute("data-lang") ||
        preEl.getAttribute("data-lang") ||
        ""
    ).trim()
    return /^[A-Za-z0-9_+#.-]{1,24}$/.test(direct) ? direct.toLowerCase() : ""
}

function enhanceCodeBlocks(containerEl) {
    for (const pre of Array.from(containerEl.querySelectorAll("pre"))) {
        if (pre.parentElement?.classList.contains("code-wrap")) continue
        codeBlockCounter += 1
        const snippetId =
            pre.id && !RESERVED_IDS.has(pre.id)
                ? pre.id
                : `code-snippet-${codeBlockCounter}`
        pre.id = snippetId

        const wrap = document.createElement("div")
        wrap.className = "code-wrap"

        const header = document.createElement("div")
        header.className = "code-header"

        const langSpan = document.createElement("span")
        langSpan.className = "code-lang"
        langSpan.textContent = detectCodeLanguage(pre)

        const copyWrap = document.createElement("span")
        copyWrap.className = "copy"

        const btn = document.createElement("button")
        btn.type = "button"
        btn.className = "copy-button"
        btn.setAttribute("command", "--copy")
        btn.setAttribute("commandfor", snippetId)
        btn.setAttribute("aria-label", "复制代码")
        btn.textContent = "复制"

        const tip = document.createElement("span")
        tip.className = "tip"
        tip.setAttribute("role", "status")

        copyWrap.append(btn, tip)
        header.append(langSpan, copyWrap)
        pre.replaceWith(wrap)
        wrap.append(header, pre)
    }
}

const copyTimers = new WeakMap()
let lastCopyAnnouncement = ""

function legacyCopy(text) {
    const field = Object.assign(document.createElement("textarea"), {
        value: text,
    })
    field.setAttribute("readonly", "")
    field.style.cssText = "position:fixed;inset-block-start:0;opacity:0"
    document.body.append(field)
    field.select()
    try {
        return document.execCommand("copy")
    } finally {
        field.remove()
    }
}

function reportCopyResult(button, ok) {
    const tip = button.nextElementSibling
    if (!tip) return
    clearTimeout(copyTimers.get(button))
    button.removeAttribute("data-copied")
    button.removeAttribute("data-failed")
    let message = ok ? "已复制" : "复制失败"
    if (message === lastCopyAnnouncement) message += "\u00A0"
    lastCopyAnnouncement = message
    tip.textContent = ""
    void button.offsetWidth
    button.setAttribute(ok ? "data-copied" : "data-failed", "")
    requestAnimationFrame(() => {
        tip.textContent = message
    })
    copyTimers.set(
        button,
        setTimeout(() => {
            button.removeAttribute("data-copied")
            button.removeAttribute("data-failed")
            tip.textContent = ""
        }, 2000)
    )
}

async function copyCodeTarget(button, target) {
    const raw = target.innerText || target.textContent || ""
    const text = raw.replace(/\n$/, "")
    if (!text) return
    try {
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            if (!legacyCopy(text)) throw new Error("Copy failed")
        }
        reportCopyResult(button, true)
    } catch {
        reportCopyResult(button, false)
    }
}

if ("CommandEvent" in window) {
    document.addEventListener(
        "command",
        event => {
            if (event.command === "--copy" && event.source && event.target) {
                void copyCodeTarget(event.source, event.target)
            }
        },
        true
    )
} else {
    document.addEventListener("click", event => {
        const button =
            event.target instanceof Element
                ? event.target.closest('button[command="--copy"]')
                : null
        if (!button) return
        const targetId = button.getAttribute("commandfor")
        const target = targetId ? document.getElementById(targetId) : null
        if (target) void copyCodeTarget(button, target)
    })
}

function computeReadingStats(text) {
    const clean = (text || "").replace(/\s+/g, " ").trim()
    if (!clean) return ""
    const cjkMatches = clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)
    const cjkCount = cjkMatches ? cjkMatches.length : 0
    const nonCjk = clean.replace(
        /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g,
        " "
    )
    const wordMatches = nonCjk.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)
    const wordCount = wordMatches ? wordMatches.length : 0
    const total = cjkCount + wordCount
    if (total === 0) return ""
    const minutes = Math.max(1, Math.round(cjkCount / 350 + wordCount / 220))
    const unitText =
        cjkCount >= wordCount
            ? `${total.toLocaleString()} 字`
            : `${total.toLocaleString()} 词`
    return `${unitText} · 约 ${minutes} 分钟`
}

function buildTableOfContents(articleEl) {
    const headings = Array.from(
        articleEl.querySelectorAll("h1, h2, h3")
    ).filter(h => (h.textContent || "").trim().length > 0)
    if (headings.length < 3) return null

    const usedIds = new Set(
        Array.from(articleEl.querySelectorAll("[id]")).map(el => el.id)
    )
    const details = document.createElement("details")
    details.className = "toc-box"

    const summary = document.createElement("summary")
    summary.textContent = `目录（${headings.length}）`

    const nav = document.createElement("nav")
    nav.setAttribute("aria-label", "文章目录")

    const list = document.createElement("ol")
    list.className = "toc-list"

    headings.forEach((heading, idx) => {
        if (!heading.id) {
            let candidate = `toc-sec-${idx + 1}`
            while (usedIds.has(candidate) || RESERVED_IDS.has(candidate)) {
                candidate += "-"
            }
            heading.id = candidate
            usedIds.add(candidate)
        }
        const li = document.createElement("li")
        const level = heading.tagName.toLowerCase()
        li.className = `toc-item toc-${level}`

        const link = document.createElement("a")
        link.setAttribute("href", `#${heading.id}`)
        link.textContent = (heading.textContent || "").trim()

        li.append(link)
        list.append(li)
    })

    nav.append(list)
    details.append(summary, nav)
    return details
}

function bindImageProgressListeners(rootEl) {
    for (const img of Array.from(rootEl.querySelectorAll("img"))) {
        img.addEventListener("load", updateScrollProgress, { once: true })
    }
}

/* Lightbox state & interactions */
let galleryItems = []
let galleryIndex = 0
let zoomScale = 1
let panX = 0
let panY = 0
let draggingPointerId = null
let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0

function getHighResForImg(img) {
    const anchor = img.closest("a[href]")
    if (anchor) {
        const href = (anchor.getAttribute("href") || "").trim()
        if (
            href &&
            !href.startsWith("#") &&
            (IMAGE_HREF_RE.test(href) ||
                href === img.getAttribute("src") ||
                href === img.currentSrc ||
                href === img.src)
        ) {
            return href
        }
    }
    return img.currentSrc || img.getAttribute("src") || img.src || ""
}

function collectGallery() {
    const main = document.getElementById("main")
    if (!main) return []
    return Array.from(main.querySelectorAll("img"))
        .map(img => ({
            img,
            src: getHighResForImg(img),
            fallback: img.currentSrc || img.getAttribute("src") || "",
            alt: img.getAttribute("alt") || "",
        }))
        .filter(entry => Boolean(entry.src))
}

function applyLightboxTransform() {
    const imgEl = document.getElementById("lightbox-img")
    const resetBtn = document.getElementById("lightbox-reset")
    if (!imgEl) return
    imgEl.style.transform = `translate(${panX.toFixed(1)}px, ${panY.toFixed(
        1
    )}px) scale(${zoomScale.toFixed(3)})`
    imgEl.classList.toggle("zoomed", zoomScale > 1.01)
    if (resetBtn) {
        resetBtn.textContent = `${Math.round(zoomScale * 100)}%`
    }
}

function resetLightboxZoom() {
    zoomScale = 1
    panX = 0
    panY = 0
    applyLightboxTransform()
}

function renderLightboxSlide() {
    const imgEl = document.getElementById("lightbox-img")
    const counterEl = document.getElementById("lightbox-counter")
    const prevBtn = document.getElementById("lightbox-prev")
    const nextBtn = document.getElementById("lightbox-next")
    if (!imgEl || !galleryItems.length) return

    const current = galleryItems[galleryIndex]
    resetLightboxZoom()
    imgEl.alt = current.alt
    imgEl.onerror = () => {
        if (current.fallback && imgEl.src !== current.fallback) {
            imgEl.src = current.fallback
        }
    }
    imgEl.src = current.src

    const total = galleryItems.length
    if (counterEl) {
        counterEl.textContent =
            total > 1 ? `${galleryIndex + 1} / ${total}` : "1 / 1"
    }
    if (prevBtn) prevBtn.hidden = total <= 1
    if (nextBtn) nextBtn.hidden = total <= 1
}

function stepLightbox(delta) {
    if (galleryItems.length <= 1) return
    galleryIndex =
        (galleryIndex + delta + galleryItems.length) % galleryItems.length
    renderLightboxSlide()
}

function openLightboxForImg(targetImg, explicitSrc) {
    const dialog = document.getElementById("lightbox")
    if (!dialog) return
    galleryItems = collectGallery()
    let idx = galleryItems.findIndex(item => item.img === targetImg)
    if (idx < 0 && explicitSrc) {
        galleryItems.push({
            img: targetImg,
            src: explicitSrc,
            fallback: targetImg?.currentSrc || targetImg?.src || "",
            alt: targetImg?.getAttribute("alt") || "",
        })
        idx = galleryItems.length - 1
    } else if (idx >= 0 && explicitSrc) {
        galleryItems[idx].src = explicitSrc
    }
    if (idx < 0) return
    galleryIndex = idx
    renderLightboxSlide()
    document.title = "Article#lightbox"
    if (!dialog.open) {
        dialog.showModal()
    }
}

function initLightbox() {
    const dialog = document.getElementById("lightbox")
    const closeBtn = document.getElementById("lightbox-close")
    const resetBtn = document.getElementById("lightbox-reset")
    const prevBtn = document.getElementById("lightbox-prev")
    const nextBtn = document.getElementById("lightbox-next")
    const stageEl = document.getElementById("lightbox-stage")
    const imgEl = document.getElementById("lightbox-img")
    if (!dialog || !stageEl || !imgEl) return

    closeBtn?.addEventListener("click", () => dialog.close())
    resetBtn?.addEventListener("click", () => resetLightboxZoom())
    prevBtn?.addEventListener("click", () => stepLightbox(-1))
    nextBtn?.addEventListener("click", () => stepLightbox(1))

    dialog.addEventListener("close", () => {
        document.title = "Article"
        draggingPointerId = null
        imgEl.classList.remove("dragging")
    })

    if (!("closedBy" in HTMLDialogElement.prototype)) {
        const outside = e => {
            const r = dialog.getBoundingClientRect()
            return (
                e.clientX < r.left ||
                e.clientX > r.right ||
                e.clientY < r.top ||
                e.clientY > r.bottom
            )
        }
        let pressedOutside = false
        dialog.addEventListener("pointerdown", e => {
            pressedOutside = e.target === dialog && outside(e)
        })
        dialog.addEventListener("pointerup", e => {
            if (pressedOutside && e.target === dialog && outside(e)) {
                dialog.close()
            }
            pressedOutside = false
        })
    }

    stageEl.addEventListener(
        "wheel",
        e => {
            if (!dialog.open) return
            e.preventDefault()
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
            zoomScale = Math.min(4, Math.max(0.5, zoomScale * factor))
            if (zoomScale <= 1.01) {
                panX = 0
                panY = 0
            }
            applyLightboxTransform()
        },
        { passive: false }
    )

    imgEl.addEventListener("dblclick", () => {
        if (zoomScale > 1.05) {
            resetLightboxZoom()
        } else {
            zoomScale = 2
            panX = 0
            panY = 0
            applyLightboxTransform()
        }
    })

    imgEl.addEventListener("pointerdown", e => {
        if (zoomScale <= 1.01 || e.button !== 0) return
        e.preventDefault()
        draggingPointerId = e.pointerId
        dragStartX = e.clientX
        dragStartY = e.clientY
        dragOriginX = panX
        dragOriginY = panY
        imgEl.classList.add("dragging")
        imgEl.setPointerCapture(e.pointerId)
    })

    imgEl.addEventListener("pointermove", e => {
        if (draggingPointerId !== e.pointerId) return
        panX = dragOriginX + (e.clientX - dragStartX)
        panY = dragOriginY + (e.clientY - dragStartY)
        applyLightboxTransform()
    })

    const endDrag = e => {
        if (draggingPointerId !== e.pointerId) return
        draggingPointerId = null
        imgEl.classList.remove("dragging")
    }
    imgEl.addEventListener("pointerup", endDrag)
    imgEl.addEventListener("pointercancel", endDrag)

    dialog.addEventListener("keydown", e => {
        if (!dialog.open) return
        if (e.key === "ArrowLeft") {
            e.preventDefault()
            e.stopPropagation()
            stepLightbox(-1)
        } else if (e.key === "ArrowRight") {
            e.preventDefault()
            e.stopPropagation()
            stepLightbox(1)
        }
    })
}

initLightbox()

document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    if (target.closest("#lightbox")) return

    const hashAnchor = target.closest('a[href^="#"]')
    if (hashAnchor) {
        const rawHref = hashAnchor.getAttribute("href") || ""
        if (rawHref.length > 1) {
            event.preventDefault()
            event.stopPropagation()
            const rawId = rawHref.slice(1)
            let decodedId = rawId
            try {
                decodedId = decodeURIComponent(rawId)
            } catch {
                decodedId = rawId
            }
            const dest =
                document.getElementById(decodedId) ||
                document.getElementById(rawId)
            dest?.scrollIntoView({ behavior: "smooth" })
            return
        }
    }

    const linkAnchor = target.closest("#main a[href]")
    if (linkAnchor) {
        const innerImg = linkAnchor.querySelector("img")
        const href = (linkAnchor.getAttribute("href") || "").trim()
        if (
            innerImg &&
            href &&
            (IMAGE_HREF_RE.test(href) ||
                href === innerImg.getAttribute("src") ||
                href === innerImg.currentSrc ||
                href === innerImg.src)
        ) {
            event.preventDefault()
            event.stopPropagation()
            openLightboxForImg(innerImg, href)
            return
        }
    }

    const clickedImg = target.closest("#main img")
    if (clickedImg && !clickedImg.closest("a[href]")) {
        event.preventDefault()
        openLightboxForImg(clickedImg)
    }
})

function sanitizeAndMount(title, dateText, articleHtml, rawUrl) {
    currentOriginUrl = rawUrl || ""
    codeBlockCounter = 0

    const dialog = document.getElementById("lightbox")
    if (dialog?.open) dialog.close()

    const sanitized = sanitizeFragment(articleHtml, rawUrl, "article")
    const articleEl = document.adoptNode(sanitized)
    articleEl.id = "content"
    enhanceCodeBlocks(articleEl)
    bindImageProgressListeners(articleEl)

    const main = document.getElementById("main")
    main.textContent = ""

    const titleEl = document.createElement("h1")
    titleEl.className = "title"
    titleEl.textContent = title || ""

    const dateEl = document.createElement("p")
    dateEl.className = "date"
    const dateSpan = document.createElement("span")
    dateSpan.textContent = dateText || ""
    dateEl.append(dateSpan)

    const statsText = computeReadingStats(articleEl.textContent || "")
    if (statsText) {
        const metaSpan = document.createElement("span")
        metaSpan.className = "reading-meta"
        metaSpan.textContent = (dateText ? "· " : "") + statsText
        dateEl.append(metaSpan)
    }

    const tocEl = buildTableOfContents(articleEl)
    if (tocEl) {
        main.append(titleEl, dateEl, tocEl, articleEl)
    } else {
        main.append(titleEl, dateEl, articleEl)
    }
    main.classList.add("show")

    const scroller = document.scrollingElement || document.documentElement
    if (scroller) {
        scroller.scrollTop = 0
        scroller.scrollLeft = 0
    }
    requestAnimationFrame(updateScrollProgress)
}

function formatFloorDate(value) {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value)
    return parsed.toLocaleString()
}

window.__appendReplies = function (floors, expectedEpoch) {
    if (
        expectedEpoch !== undefined &&
        Number(expectedEpoch) !== currentRenderEpoch
    ) {
        return
    }
    const main = document.getElementById("main")
    if (!main || !Array.isArray(floors)) return

    let section = document.getElementById("replies")
    if (!section) {
        section = document.createElement("section")
        section.id = "replies"
        section.className = "replies-section"
        section.setAttribute("aria-label", "后续回复楼层")
        main.append(section)
    }
    section.textContent = ""

    const heading = document.createElement("h2")
    heading.className = "replies-heading"
    heading.textContent =
        floors.length > 0
            ? `后续回复（${floors.length} 层）`
            : "暂无后续回复楼层"
    section.append(heading)

    for (const item of floors) {
        const card = document.createElement("div")
        card.className = "reply-floor"
        if (typeof item.floor === "number" && item.floor > 0) {
            card.id = `floor-${item.floor}`
        }

        const meta = document.createElement("div")
        meta.className = "reply-meta"
        const parts = [`#${item.floor || "?"}楼`, item.author || "匿名"]
        const dateStr = formatFloorDate(item.createdAt)
        if (dateStr) parts.push(dateStr)
        parts.push(`♥ ${typeof item.likes === "number" ? item.likes : 0}`)
        meta.textContent = parts.join(" · ")

        const sanitizedBody = sanitizeFragment(
            item.html || "",
            currentOriginUrl,
            "div"
        )
        const bodyEl = document.adoptNode(sanitizedBody)
        enhanceCodeBlocks(bodyEl)
        bindImageProgressListeners(bodyEl)

        card.append(meta, bodyEl)
        section.append(card)
    }

    requestAnimationFrame(updateScrollProgress)
}

window.__stepLightbox = stepLightbox

window.__updateArticleStyle = applyStyle

window.__renderArticle = function (payload) {
    if (!payload) return
    currentRenderEpoch = Number(payload.epoch) || 0
    applyStyle(payload)
    sanitizeAndMount(payload.title, payload.dateText, payload.html, payload.url)
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
    const headerDoc = new DOMParser().parseFromString(legacyHeader, "text/html")
    sanitizeAndMount(
        headerDoc.querySelector(".title")?.textContent || "",
        headerDoc.querySelector(".date")?.textContent || "",
        legacyHtml,
        getParam("u")
    )
}
