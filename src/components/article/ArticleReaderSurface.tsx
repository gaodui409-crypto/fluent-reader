import * as React from "react"
import { useEffect, useLayoutEffect, useRef } from "react"
import intl from "react-intl-universal"
import { DefaultButton, Icon, Stack } from "@fluentui/react"
import { makeStyles, mergeClasses, shorthands } from "@griffel/react"
import { RSSItem } from "../../scripts/models/item"
import { RSSSource } from "../../scripts/models/source"

const useStyles = makeStyles({
    content: {
        display: "inline-flex",
        width: "100%",
        flexGrow: 1,
        minHeight: 0,
        ...shorthands.borderStyle("none"),
        color: "var(--black)",
    },
    hidden: { display: "none" },
    errorWrap: {
        padding: "24px",
        textAlign: "center",
    },
    errorIcon: {
        fontSize: "32px",
        color: "var(--neutralSecondary)",
    },
    errorCode: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        maxWidth: "520px",
        lineHeight: "1.6",
        userSelect: "text",
    },
    errorActions: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        justifyContent: "center",
    },
})

function safeJsLiteral(value: unknown): string {
    return JSON.stringify(value)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
}

export const ArticleReaderSurface: React.FC<{
    item: RSSItem
    source: RSSSource
    locale: string
    dark: boolean
    webview: React.RefObject<Electron.WebviewTag>
    webviewKey: string
    showWebview: boolean
    hiddenByExpandedPanel?: boolean
    loadWebpage: boolean
    loadFull: boolean
    fullContent: string
    fontFamily: string
    fontSize: number
    error: string
    onLocalReady?: () => void
    onReload: () => void
    onSwitchWebpage: () => void
}> = ({
    item,
    source,
    locale,
    dark,
    webview,
    webviewKey,
    showWebview,
    hiddenByExpandedPanel,
    loadWebpage,
    loadFull,
    fullContent,
    fontFamily,
    fontSize,
    error,
    onLocalReady,
    onReload,
    onSwitchWebpage,
}) => {
    const classes = useStyles()
    const domReadyRef = useRef(false)

    const dateText = item.date.toLocaleString(locale, {
        hour12: !locale.startsWith("zh"),
    })
    const articleHtml = loadFull ? fullContent || item.content : item.content

    const latestPayloadRef = useRef({
        title: item.title,
        dateText,
        html: articleHtml,
        url: item.link,
        fontSize,
        fontFamily,
        dir: source.textDir,
        locale,
        dark,
    })
    latestPayloadRef.current = {
        title: item.title,
        dateText,
        html: articleHtml,
        url: item.link,
        fontSize,
        fontFamily,
        dir: source.textDir,
        locale,
        dark,
    }

    useLayoutEffect(() => {
        domReadyRef.current = false
        const node = webview.current
        if (!node || loadWebpage || !showWebview) return

        const onStartLoading = () => {
            domReadyRef.current = false
        }
        const onDomReady = () => {
            domReadyRef.current = true
            onLocalReady?.()
            void node
                .executeJavaScript(
                    `window.__renderArticle && window.__renderArticle(${safeJsLiteral(
                        latestPayloadRef.current
                    )})`
                )
                .catch(console.error)
        }
        node.addEventListener("did-start-loading", onStartLoading)
        node.addEventListener("dom-ready", onDomReady)
        return () => {
            node.removeEventListener("did-start-loading", onStartLoading)
            node.removeEventListener("dom-ready", onDomReady)
        }
    }, [webview, webviewKey, loadWebpage, showWebview, onLocalReady])

    useEffect(() => {
        const node = webview.current
        if (!node || loadWebpage || !showWebview || !domReadyRef.current) return
        void node
            .executeJavaScript(
                `window.__renderArticle && window.__renderArticle(${safeJsLiteral(
                    latestPayloadRef.current
                )})`
            )
            .catch(console.error)
    }, [
        webview,
        loadWebpage,
        showWebview,
        item._id,
        item.title,
        item.link,
        dateText,
        articleHtml,
        locale,
    ])

    useEffect(() => {
        const node = webview.current
        if (!node || loadWebpage || !showWebview || !domReadyRef.current) return
        void node
            .executeJavaScript(
                `window.__updateArticleStyle && window.__updateArticleStyle(${safeJsLiteral(
                    { fontSize, fontFamily, dir: source.textDir, locale, dark }
                )})`
            )
            .catch(console.error)
    }, [
        webview,
        loadWebpage,
        showWebview,
        fontSize,
        fontFamily,
        source.textDir,
        locale,
        dark,
    ])

    return (
        <>
            {showWebview && (
                <webview
                    id="article"
                    className={mergeClasses(
                        classes.content,
                        (error || hiddenByExpandedPanel) && classes.hidden
                    )}
                    ref={webview}
                    key={webviewKey}
                    src={loadWebpage ? item.link : "article/article.html"}
                    allowpopups={"true" as unknown as boolean}
                    webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes,disableDialogs,autoplayPolicy=document-user-activation-required"
                    partition={loadWebpage ? "persist:sandbox" : undefined}
                />
            )}
            {error && !hiddenByExpandedPanel && (
                <Stack
                    className={mergeClasses(
                        "error-prompt",
                        classes.content,
                        classes.errorWrap
                    )}
                    verticalAlign="center"
                    horizontalAlign="center"
                    tokens={{ childrenGap: 14 }}>
                    <Icon
                        iconName="DocumentError"
                        className={classes.errorIcon}
                    />
                    <strong>{intl.get("article.error")}</strong>
                    <span className={classes.errorCode}>{error}</span>
                    <div className={classes.errorActions}>
                        <DefaultButton onClick={onReload}>
                            {intl.get("article.reload")}
                        </DefaultButton>
                        {!loadWebpage && (
                            <DefaultButton onClick={onSwitchWebpage}>
                                切换「加载网页」查看
                            </DefaultButton>
                        )}
                        <DefaultButton
                            onClick={() =>
                                window.utils.openExternal(item.link, false)
                            }>
                            {intl.get("openExternal")}
                        </DefaultButton>
                    </div>
                </Stack>
            )}
        </>
    )
}
