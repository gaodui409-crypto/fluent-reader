import * as React from "react"
import intl from "react-intl-universal"
import { closeContextMenu, refreshIfDue } from "../scripts/models/app"
import Page from "./page"
import { Menu } from "./menu"
import Nav from "./nav"
import Settings from "./settings"
import FullSearch from "./personal/search"
import SourceSettings from "./personal/source-settings"
import { Briefings } from "./personal/ai"
import OrganizePanel from "./personal/organize"
import { showItemFromId } from "../scripts/models/page"
import { loadLibrary, expireUnread } from "../scripts/models/library"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import { ContextMenu } from "./context-menu"
import LogMenu from "./log-menu"
import {
    FluentProvider,
    makeStyles,
    mergeClasses,
    tokens,
} from "@fluentui/react-components"
import { useEffect, useMemo, useRef, useState } from "react"
import { Icon, loadTheme, ThemeProvider } from "@fluentui/react"
import { CUSTOM_STYLE_HOOKS, createAppTheme } from "./utils/theme"
import { CustomStyleHooksProvider_unstable as CustomStyleHooksProvider } from "@fluentui/react-shared-contexts"
import { getFontFamilyForLocale } from "../scripts/settings"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import { ArticleSelectionBar } from "./personal/organize"
import { FolderManager } from "./personal/folders"

const useClasses = makeStyles({
    root: {
        background: "none",
        height: "100%",
    },
    articleBackground: {
        // Directly blurred backgrounds fade to transparency at the window edges.
        backgroundColor: "var(--neutralLighterAlt)",
    },
    articleBackgroundDarwin: {
        // Fade the opaque backing in with the article scrim.
        animationName: {
            from: { backgroundColor: "transparent" },
            to: { backgroundColor: "var(--neutralLighterAlt)" },
        },
        animationDuration: "0.5s",
        animationTimingFunction: "var(--transition-timing)",
        animationFillMode: "backwards",
    },
    toast: {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 10000,
        maxWidth: "380px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "8px",
        backgroundColor: tokens.colorNeutralBackground1,
        color: tokens.colorNeutralForeground1,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        boxShadow:
            "0 8px 24px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12)",
        fontSize: "13px",
        lineHeight: "18px",
    },
    toastError: {
        borderLeft: "4px solid #d13438",
    },
    toastSuccess: {
        borderLeft: "4px solid #107c10",
    },
    toastInfo: {
        borderLeft: `4px solid ${tokens.colorBrandStroke1}`,
    },
    toastClose: {
        "border": "none",
        "background": "transparent",
        "color": tokens.colorNeutralForeground3,
        "cursor": "pointer",
        "padding": "2px 4px",
        "marginLeft": "auto",
        "borderRadius": "4px",
        ":hover": {
            color: tokens.colorNeutralForeground1,
            backgroundColor: tokens.colorSubtleBackgroundHover,
        },
    },
})

const Root: React.FC = () => {
    const dispatch = useAppDispatch()
    const locale = useAppSelector(s => s.app.locale)
    const sourceInit = useAppSelector(s => s.app.sourceInit)
    const articleOverlayOpen = useArticleOverlayOpen()
    const preferences = useAppSelector(s => s.preferences)
    const sourceKeys = useAppSelector(s => Object.keys(s.sources).join(","))
    const refreshCompletedAt = useAppSelector(s => s.app.refreshCompletedAt)
    const [toast, setToast] = useState<{
        text: string
        kind: "info" | "success" | "error"
    } | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => {
        const onToast = (
            e: CustomEvent<{ text: string; kind: "info" | "success" | "error" }>
        ) => {
            if (!e.detail?.text) return
            clearTimeout(toastTimer.current)
            setToast(e.detail)
            toastTimer.current = setTimeout(
                () => setToast(null),
                e.detail.kind === "error" ? 5500 : 3200
            )
        }
        window.addEventListener("personal-toast", onToast as EventListener)
        return () => {
            clearTimeout(toastTimer.current)
            window.removeEventListener(
                "personal-toast",
                onToast as EventListener
            )
        }
    }, [])

    useEffect(() => {
        const refresh = () => {
            void dispatch(refreshIfDue()).catch(console.error)
        }
        const online = () => {
            void dispatch(refreshIfDue(true)).catch(console.error)
        }
        const focus = (event: CustomEvent<{ focused: boolean }>) => {
            if (event.detail.focused) refresh()
        }
        window.addEventListener("focus", refresh)
        window.addEventListener("online", online)
        window.addEventListener("app-window-focus-change", focus)
        return () => {
            window.removeEventListener("focus", refresh)
            window.removeEventListener("online", online)
            window.removeEventListener("app-window-focus-change", focus)
        }
    }, [dispatch])

    const classes = useClasses()
    const [isDarkMode, setIsDarkMode] = useState(() =>
        globalThis.settings.shouldUseDarkColors()
    )
    useEffect(() => {
        const load = () => {
            void dispatch(loadLibrary()).catch(console.error)
        }
        load()
        return window.personal.onChanged(load)
    }, [dispatch])
    useEffect(() => {
        if (!sourceInit) return
        const expire = () => {
            void dispatch(expireUnread()).catch(error =>
                window.utils.showErrorBox(
                    intl.get("personal.failed"),
                    String(error)
                )
            )
        }
        expire()
        const timer = setInterval(expire, 3600000)
        return () => clearInterval(timer)
    }, [dispatch, sourceInit, preferences, sourceKeys, refreshCompletedAt])
    useEffect(() => {
        return window.personal.onOpenArticle(id => dispatch(showItemFromId(id)))
    }, [dispatch])
    useEffect(() => {
        return globalThis.settings.addThemeUpdateListener(shouldDark => {
            setIsDarkMode(shouldDark)
        })
    }, [])
    const themeBundle = useMemo(
        () => createAppTheme(isDarkMode, getFontFamilyForLocale(locale)),
        [isDarkMode, locale]
    )
    useEffect(() => {
        // Sync global v8 theme and root CSS variables so portaled Dialogs/Modals/Callouts
        // on document.body inherit both v8 and v9 dark/light foreground & surface tokens.
        loadTheme(themeBundle.v8Theme)
        const docEl = document.documentElement
        const scheme = isDarkMode ? "dark" : "light"
        docEl.dataset.theme = scheme
        docEl.style.colorScheme = scheme
        docEl.style.color = themeBundle.v9Theme.colorNeutralForeground1
        for (const [tokenKey, tokenVal] of Object.entries(
            themeBundle.v9Theme
        )) {
            if (typeof tokenVal === "string" || typeof tokenVal === "number") {
                docEl.style.setProperty(`--${tokenKey}`, String(tokenVal))
            }
        }
    }, [isDarkMode, themeBundle])
    return (
        locale && (
            <FluentProvider
                theme={themeBundle.v9Theme}
                className={classes.root}>
                <ThemeProvider
                    theme={themeBundle.v8Theme}
                    applyTo="none"
                    style={{ height: "100%" }}>
                    <CustomStyleHooksProvider value={CUSTOM_STYLE_HOOKS}>
                        <div
                            id="root"
                            key={locale}
                            className={
                                articleOverlayOpen
                                    ? mergeClasses(
                                          classes.articleBackground,
                                          globalThis.utils.platform ===
                                              "darwin" &&
                                              classes.articleBackgroundDarwin
                                      )
                                    : undefined
                            }
                            onMouseDown={() => dispatch(closeContextMenu())}>
                            <Nav />
                            <ArticleSelectionBar />
                            <Page />
                            <LogMenu />
                            <Menu />
                            <Settings />
                            <FullSearch />
                            <SourceSettings />
                            <OrganizePanel />
                            <FolderManager />
                            <Briefings />
                            <ContextMenu />
                            {toast && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className={mergeClasses(
                                        classes.toast,
                                        toast.kind === "error"
                                            ? classes.toastError
                                            : toast.kind === "success"
                                            ? classes.toastSuccess
                                            : classes.toastInfo
                                    )}>
                                    <Icon
                                        iconName={
                                            toast.kind === "error"
                                                ? "ErrorBadge"
                                                : toast.kind === "success"
                                                ? "Completed"
                                                : "Info"
                                        }
                                        style={{
                                            color:
                                                toast.kind === "error"
                                                    ? "#d13438"
                                                    : toast.kind === "success"
                                                    ? "#107c10"
                                                    : "var(--primary)",
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span>{toast.text}</span>
                                    <button
                                        type="button"
                                        className={classes.toastClose}
                                        aria-label={intl.get("close")}
                                        onClick={() => setToast(null)}>
                                        <Icon
                                            iconName="Cancel"
                                            style={{ fontSize: 11 }}
                                        />
                                    </button>
                                </div>
                            )}
                        </div>
                    </CustomStyleHooksProvider>
                </ThemeProvider>
            </FluentProvider>
        )
    )
}

export default Root
