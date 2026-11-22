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
import TagsEditor from "./personal/tags"
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
} from "@fluentui/react-components"
import { useEffect, useMemo, useState } from "react"
import { loadTheme, ThemeProvider } from "@fluentui/react"
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
})

const Root: React.FC = () => {
    const dispatch = useAppDispatch()
    const locale = useAppSelector(s => s.app.locale)
    const sourceInit = useAppSelector(s => s.app.sourceInit)
    const articleOverlayOpen = useArticleOverlayOpen()
    const preferences = useAppSelector(s => s.preferences)
    const sourceKeys = useAppSelector(s => Object.keys(s.sources).join(","))
    const refreshCompletedAt = useAppSelector(s => s.app.refreshCompletedAt)
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
                            <TagsEditor />
                            <OrganizePanel />
                            <FolderManager />
                            <Briefings />
                            <ContextMenu />
                        </div>
                    </CustomStyleHooksProvider>
                </ThemeProvider>
            </FluentProvider>
        )
    )
}

export default Root
