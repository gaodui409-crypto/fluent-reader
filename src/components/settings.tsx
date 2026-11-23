import * as React from "react"
import { useEffect, useRef, useCallback, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { AnimationClassNames } from "@fluentui/react/lib/Styling"
import { FocusTrapZone } from "@fluentui/react"
import { Spinner } from "@fluentui/react-components"
import AboutTab from "./settings/about"
import PersonalTab, {
    PersonalSectionMode,
    PersonalPrefillRequest,
} from "./settings/personal"
import SourcesTabContainer from "../containers/settings/sources-container"
import GroupsTab from "./settings/groups"
import AppTabContainer from "../containers/settings/app-container"
import RulesTab from "./settings/rules"
import ServiceTabContainer from "../containers/settings/service-container"
import { initTouchBarWithTexts } from "../scripts/utils"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { exitSettings, toggleSettings } from "../scripts/models/app"
import { FlatButton } from "./utils/FlatButton"

type SettingsTabKey =
    | "sources"
    | "grouping"
    | "rules"
    | "health"
    | "ai"
    | "accounts"
    | "network"
    | "backup"
    | "app"
    | "service"
    | "about"

type OpenPersonalSectionDetail =
    | string
    | {
          section?: string
          url?: string
          host?: string
      }

interface NavItem {
    key: SettingsTabKey
    label: string
    icon: string
}

interface NavGroup {
    title: string
    items: NavItem[]
}

function resolvePersonalJump(detail: OpenPersonalSectionDetail): {
    tab: SettingsTabKey
    anchorId?: string
    prefill?: Omit<PersonalPrefillRequest, "seq">
} {
    const rawSection =
        typeof detail === "string" ? detail : detail?.section || "ai"
    const url = typeof detail === "object" && detail ? detail.url : undefined
    const host = typeof detail === "object" && detail ? detail.host : undefined

    switch (rawSection) {
        case "ai":
        case "personal":
            return { tab: "ai" }
        case "accounts":
            return {
                tab: "accounts",
                anchorId: "personal-accounts",
                prefill: { section: "accounts", url, host },
            }
        case "siteRules":
            return {
                tab: "accounts",
                anchorId: "personal-siteRules",
                prefill: { section: "siteRules", url, host },
            }
        case "offlineSave":
            return { tab: "backup", anchorId: "personal-offlineSave" }
        case "backup":
            return { tab: "backup", anchorId: "personal-backup" }
        case "search":
            return { tab: "backup", anchorId: "personal-search" }
        case "network":
            return { tab: "network" }
        case "health":
            return { tab: "health" }
        case "shortcuts":
            return { tab: "about", anchorId: "personal-shortcuts" }
        default:
            return { tab: "ai" }
    }
}

const Settings: React.FC = () => {
    const dispatch = useAppDispatch()
    const [selectedTab, setSelectedTab] = useState<SettingsTabKey>("sources")
    const [prefill, setPrefill] = useState<PersonalPrefillRequest>()
    const [pendingAnchor, setPendingAnchor] = useState<string>("")
    const seqRef = useRef(0)
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
    const panelRef = useRef<HTMLDivElement | null>(null)

    const display = useAppSelector(s => s.app.settings.display)
    const sids = useAppSelector(s => s.app.settings.sids)
    const locale = useAppSelector(s => s.app.locale)
    const blocked = useAppSelector(
        s =>
            !s.app.sourceInit ||
            s.app.syncing ||
            s.app.fetchingItems ||
            s.app.settings.saving
    )
    const exitting = useAppSelector(s => s.app.settings.saving)

    const exittingRef = useRef(exitting)
    exittingRef.current = exitting
    const displayRef = useRef(display)
    displayRef.current = display
    const wasDisplayRef = useRef(display)

    const zh = (locale || "zh-CN").startsWith("zh")

    const navGroups: NavGroup[] = [
        {
            title: zh ? "订阅与整理" : "Subscriptions & Rules",
            items: [
                {
                    key: "sources",
                    label: zh ? "订阅源" : intl.get("settings.sources"),
                    icon: "Source",
                },
                {
                    key: "grouping",
                    label: zh ? "分组与排序" : intl.get("settings.grouping"),
                    icon: "GroupList",
                },
                {
                    key: "rules",
                    label: zh ? "规则" : intl.get("settings.rules"),
                    icon: "FilterSettings",
                },
                {
                    key: "health",
                    label: zh ? "订阅健康" : intl.get("health.title"),
                    icon: "Health",
                },
            ],
        },
        {
            title: zh ? "AI 与增强" : "AI & Reading",
            items: [
                {
                    key: "ai",
                    label: zh ? "AI 设置" : intl.get("ai.settings"),
                    icon: "Lightbulb",
                },
                {
                    key: "accounts",
                    label: zh
                        ? "账号与正文提取"
                        : intl.get("personal.accounts"),
                    icon: "Permissions",
                },
                {
                    key: "network",
                    label: zh ? "请求队列" : intl.get("personal.network"),
                    icon: "Processing",
                },
            ],
        },
        {
            title: zh ? "本地数据与系统" : "Data & System",
            items: [
                {
                    key: "backup",
                    label: zh ? "离线与备份" : intl.get("personal.backup"),
                    icon: "Save",
                },
                {
                    key: "app",
                    label: zh ? "应用偏好" : intl.get("settings.app"),
                    icon: "Settings",
                },
                {
                    key: "service",
                    label: zh ? "服务" : intl.get("settings.service"),
                    icon: "CloudImportExport",
                },
                {
                    key: "about",
                    label: zh ? "快捷键与关于" : intl.get("settings.about"),
                    icon: "Info",
                },
            ],
        },
    ]

    const flatTabs = navGroups.flatMap(g => g.items)

    const close = useCallback(() => {
        void dispatch(exitSettings())
    }, [dispatch])

    useEffect(() => {
        const jumpPersonal = (event: Event) => {
            const detail = (event as CustomEvent<OpenPersonalSectionDetail>)
                .detail
            const target = resolvePersonalJump(detail || "ai")
            if (!displayRef.current) {
                dispatch(toggleSettings(true))
            }
            setSelectedTab(target.tab)
            if (target.prefill) {
                seqRef.current += 1
                setPrefill({ ...target.prefill, seq: seqRef.current })
            }
            if (target.anchorId) {
                setPendingAnchor(target.anchorId)
            }
        }
        window.addEventListener("open-personal-section", jumpPersonal)
        return () =>
            window.removeEventListener("open-personal-section", jumpPersonal)
    }, [dispatch])

    useEffect(() => {
        if (wasDisplayRef.current && !display) {
            setSelectedTab("sources")
            setPrefill(undefined)
            setPendingAnchor("")
        }
        wasDisplayRef.current = display
    }, [display])

    useEffect(() => {
        if (display && sids.length > 0) {
            setSelectedTab("sources")
        }
    }, [display, sids])

    useEffect(() => {
        if (!display || !pendingAnchor) return
        const raf = requestAnimationFrame(() => {
            const targetEl = document.getElementById(pendingAnchor)
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            setPendingAnchor("")
        })
        return () => cancelAnimationFrame(raf)
    }, [display, selectedTab, pendingAnchor])

    useEffect(() => {
        if (display && panelRef.current && !pendingAnchor) {
            panelRef.current.scrollTop = 0
        }
    }, [display, selectedTab, pendingAnchor])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || exittingRef.current) return
            if (event.defaultPrevented) return
            // Do not close the entire Settings screen when a visible child Dialog, Modal, or Dropdown Callout is open
            if (
                Array.from(
                    document.querySelectorAll<HTMLElement>(
                        ".ms-Dialog-main, .ms-Modal-scrollableContent, .fui-DialogSurface, .ms-ContextualMenu, .ms-Dropdown-callout, .ms-ComboBox-callout, .ms-DatePicker-callout, .fui-MenuPopover, .fui-Listbox"
                    )
                ).some(
                    el =>
                        el.getClientRects().length > 0 &&
                        getComputedStyle(el).visibility !== "hidden"
                )
            ) {
                return
            }
            close()
        }
        if (display) {
            if (globalThis.utils.platform === "darwin")
                globalThis.utils.destroyTouchBar()
            document.body.addEventListener("keydown", onKeyDown)
        } else if (globalThis.utils.platform === "darwin") {
            initTouchBarWithTexts()
        }
        return () => {
            document.body.removeEventListener("keydown", onKeyDown)
        }
    }, [display, close])

    const handleTabListKeyDown = (event: React.KeyboardEvent) => {
        const idx = flatTabs.findIndex(item => item.key === selectedTab)
        if (idx < 0) return
        let nextIdx = -1
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            nextIdx = (idx + 1) % flatTabs.length
        } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            nextIdx = (idx - 1 + flatTabs.length) % flatTabs.length
        } else if (event.key === "Home") {
            nextIdx = 0
        } else if (event.key === "End") {
            nextIdx = flatTabs.length - 1
        }
        if (nextIdx >= 0) {
            event.preventDefault()
            const nextKey = flatTabs[nextIdx].key
            setSelectedTab(nextKey)
            const btn = tabRefs.current[nextKey]
            btn?.focus()
            btn?.scrollIntoView({ block: "nearest", inline: "nearest" })
        }
    }

    const isPersonalSection = (
        tab: SettingsTabKey
    ): tab is PersonalSectionMode =>
        tab === "health" ||
        tab === "ai" ||
        tab === "accounts" ||
        tab === "network" ||
        tab === "backup"

    return (
        display && (
            <div className="settings-container">
                <div className={"settings " + AnimationClassNames.slideUpIn20}>
                    {blocked && (
                        <FocusTrapZone
                            isClickableOutsideFocusTrap={true}
                            className="loading">
                            <Spinner
                                label={intl.get("settings.fetching")}
                                labelPosition="below"
                                size="tiny"
                                tabIndex={0}
                            />
                        </FocusTrapZone>
                    )}
                    <nav
                        className="settings-nav-rail"
                        aria-label={
                            zh ? "选项导航" : intl.get("settings.name")
                        }>
                        <div className="settings-rail-header">
                            <FlatButton
                                disabled={exitting}
                                title={intl.get("settings.exit")}
                                ariaLabel={intl.get("settings.exit")}
                                onClick={close}>
                                <Icon iconName="Back" />
                            </FlatButton>
                            <span className="settings-rail-title">
                                {zh ? "选项" : intl.get("settings.name")}
                            </span>
                        </div>
                        <div
                            className="settings-rail-scroll"
                            role="tablist"
                            aria-orientation="vertical"
                            aria-label={
                                zh ? "选项分类" : intl.get("settings.name")
                            }
                            onKeyDown={handleTabListKeyDown}>
                            {navGroups.map(group => (
                                <React.Fragment key={group.title}>
                                    <div
                                        role="presentation"
                                        className="settings-nav-group-label">
                                        {group.title}
                                    </div>
                                    {group.items.map(item => {
                                        const active = selectedTab === item.key
                                        return (
                                            <button
                                                key={item.key}
                                                ref={el => {
                                                    tabRefs.current[item.key] =
                                                        el
                                                }}
                                                id={`settings-tab-${item.key}`}
                                                type="button"
                                                role="tab"
                                                aria-selected={active}
                                                tabIndex={active ? 0 : -1}
                                                className="settings-nav-tab"
                                                onClick={() =>
                                                    setSelectedTab(item.key)
                                                }>
                                                <Icon
                                                    iconName={item.icon}
                                                    className="settings-nav-tab-icon"
                                                />
                                                <span>{item.label}</span>
                                            </button>
                                        )
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </nav>
                    <div
                        ref={panelRef}
                        role="tabpanel"
                        id="settings-tabpanel"
                        aria-labelledby={`settings-tab-${selectedTab}`}
                        className="settings-panel">
                        {selectedTab === "sources" && <SourcesTabContainer />}
                        {selectedTab === "grouping" && <GroupsTab />}
                        {selectedTab === "rules" && <RulesTab />}
                        {selectedTab === "service" && <ServiceTabContainer />}
                        {selectedTab === "app" && <AppTabContainer />}
                        {selectedTab === "about" && <AboutTab />}
                        {isPersonalSection(selectedTab) && (
                            <PersonalTab
                                section={selectedTab}
                                prefill={prefill}
                            />
                        )}
                    </div>
                </div>
            </div>
        )
    )
}

export default Settings
