import { useCallback, useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    defaultPersonalSettings,
    PersonalSettings,
    PersonalStatus,
    WebAccountInfo,
} from "../../../personal-types"

export interface PersonalPrefillRequest {
    section?: string
    url?: string
    host?: string
    seq?: number
}

export function normalizeHttpUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ""
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed
    return "https://" + trimmed.replace(/^\/+/, "")
}

export function extractHost(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ""
    if (
        /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ||
        trimmed.includes("/")
    ) {
        try {
            const parsed = new URL(normalizeHttpUrl(trimmed))
            return parsed.hostname.toLowerCase()
        } catch {
            return trimmed
                .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/+/i, "")
                .split("/")[0]
                .toLowerCase()
        }
    }
    return trimmed.toLowerCase()
}

const STATUS_POLL_SECTIONS = new Set([
    "search",
    "offlineSave",
    "backup",
    "network",
])

export function usePersonalSettings(
    initialSection = "accounts",
    prefill?: PersonalPrefillRequest
) {
    const [section, setSection] = useState(initialSection)
    const [settings, setSettings] = useState<PersonalSettings>(
        defaultPersonalSettings
    )
    const [autoSaveState, setAutoSaveState] = useState<
        "idle" | "saving" | "saved"
    >("idle")
    const [status, setStatus] = useState<PersonalStatus>()
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [accounts, setAccounts] = useState<WebAccountInfo[]>([])
    const [site, setSite] = useState("")
    const [host, setHost] = useState("")
    const [container, setContainer] = useState("")
    const [remove, setRemove] = useState("")
    const [mode, setMode] = useState<"direct" | "rendered" | "off">("direct")
    const [testUrl, setTestUrl] = useState("")

    const settingsRef = useRef<PersonalSettings>(defaultPersonalSettings)
    const savedSnapshotRef = useRef<PersonalSettings>(defaultPersonalSettings)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    )
    const mountedRef = useRef(true)

    useEffect(() => {
        setSection(initialSection)
    }, [initialSection])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (savedBadgeTimerRef.current) {
                clearTimeout(savedBadgeTimerRef.current)
            }
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
                void window.personal
                    .saveSettings(settingsRef.current)
                    .catch(() => {})
            }
        }
    }, [])

    const markSavedBadge = useCallback(() => {
        if (!mountedRef.current) return
        setAutoSaveState("saved")
        if (savedBadgeTimerRef.current) {
            clearTimeout(savedBadgeTimerRef.current)
        }
        savedBadgeTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setAutoSaveState("idle")
        }, 2800)
    }, [])

    const persistSettings = useCallback(
        async (next: PersonalSettings) => {
            if (mountedRef.current) {
                setAutoSaveState("saving")
                setError("")
            }
            try {
                const saved = await window.personal.saveSettings(next)
                savedSnapshotRef.current = saved
                settingsRef.current = saved
                if (mountedRef.current) {
                    setSettings(saved)
                    markSavedBadge()
                }
                return saved
            } catch (err) {
                if (mountedRef.current) {
                    setAutoSaveState("idle")
                    setError(String(err))
                }
                throw err
            }
        },
        [markSavedBadge]
    )

    const saveImmediate = useCallback(
        async (patch: Partial<PersonalSettings>) => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
            const next: PersonalSettings = {
                ...settingsRef.current,
                ...patch,
            }
            settingsRef.current = next
            setSettings(next)
            try {
                await persistSettings(next)
            } catch {
                // error state already set in persistSettings
            }
        },
        [persistSettings]
    )

    const updateDraft = useCallback(
        <K extends keyof PersonalSettings>(
            key: K,
            value: PersonalSettings[K],
            valid = true
        ) => {
            const next: PersonalSettings = {
                ...settingsRef.current,
                [key]: value,
            }
            settingsRef.current = next
            setSettings(next)
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
            if (valid) {
                debounceTimerRef.current = setTimeout(() => {
                    debounceTimerRef.current = null
                    if (
                        JSON.stringify(settingsRef.current) !==
                        JSON.stringify(savedSnapshotRef.current)
                    ) {
                        void persistSettings(settingsRef.current).catch(
                            () => {}
                        )
                    }
                }, 500)
            }
        },
        [persistSettings]
    )

    const flushDraft = useCallback(
        (overridePatch?: Partial<PersonalSettings>) => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
            }
            const next: PersonalSettings = overridePatch
                ? { ...settingsRef.current, ...overridePatch }
                : settingsRef.current
            settingsRef.current = next
            setSettings(next)
            if (
                JSON.stringify(next) !==
                JSON.stringify(savedSnapshotRef.current)
            ) {
                void persistSettings(next).catch(() => {})
            }
        },
        [persistSettings]
    )

    const act = useCallback(async (fn: () => Promise<unknown>) => {
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const result = await fn()
            if (result !== null && result !== false && mountedRef.current) {
                setMessage(
                    typeof result === "string"
                        ? result
                        : intl.get("personal.saved")
                )
            }
        } catch (err) {
            if (mountedRef.current) setError(String(err))
        } finally {
            if (mountedRef.current) setBusy(false)
        }
    }, [])

    const applyPrefillPayload = useCallback(
        (payload?: PersonalPrefillRequest) => {
            if (!payload) return
            const targetSection = payload.section
            if (targetSection === "accounts") {
                if (payload.url) {
                    try {
                        const origin = new URL(normalizeHttpUrl(payload.url))
                            .origin
                        setSite(origin)
                    } catch {
                        setSite(normalizeHttpUrl(payload.url))
                    }
                } else if (payload.host) {
                    setSite("https://" + extractHost(payload.host))
                }
            } else if (targetSection === "siteRules") {
                const cleanHost = extractHost(payload.host || payload.url || "")
                if (cleanHost) {
                    setHost(cleanHost)
                    const existing = settingsRef.current.siteRules.find(
                        r => r.host === cleanHost
                    )
                    if (existing) {
                        setMode(existing.mode)
                        setContainer(existing.container)
                        setRemove(existing.remove)
                    } else {
                        setMode("direct")
                        setContainer("")
                        setRemove("")
                    }
                }
                if (payload.url) {
                    setTestUrl(normalizeHttpUrl(payload.url))
                }
            }
        },
        []
    )

    const pendingPrefillRef = useRef<PersonalPrefillRequest | undefined>(
        prefill
    )
    pendingPrefillRef.current = prefill

    useEffect(() => {
        applyPrefillPayload(prefill)
    }, [prefill, applyPrefillPayload])

    useEffect(() => {
        const onJump = (e: Event) => {
            const detail = (e as CustomEvent<string | PersonalPrefillRequest>)
                .detail
            if (!detail) return
            if (typeof detail === "string") {
                setSection(detail)
            } else {
                if (detail.section) setSection(detail.section)
                applyPrefillPayload(detail)
            }
        }
        window.addEventListener("open-personal-section", onJump)
        return () => window.removeEventListener("open-personal-section", onJump)
    }, [applyPrefillPayload])

    const refreshSettings = useCallback(async () => {
        const s = await window.personal.settings()
        settingsRef.current = s
        savedSnapshotRef.current = s
        if (mountedRef.current) {
            setSettings(s)
        }
        return s
    }, [])

    useEffect(() => {
        let active = true
        window.personal
            .settings()
            .then(s => {
                if (active) {
                    settingsRef.current = s
                    savedSnapshotRef.current = s
                    setSettings(s)
                    if (pendingPrefillRef.current) {
                        applyPrefillPayload(pendingPrefillRef.current)
                    }
                }
            })
            .catch(err => {
                if (active) setError(String(err))
            })
        window.personal
            .accounts()
            .then(a => {
                if (active) setAccounts(a)
            })
            .catch(err => {
                if (active) setError(String(err))
            })

        const pollStatus = () => {
            window.personal
                .status()
                .then(st => {
                    if (active) setStatus(st)
                })
                .catch(err => {
                    if (active) setError(String(err))
                })
        }
        pollStatus()
        const off = window.personal.onChanged(() => {
            pollStatus()
            void window.personal
                .accounts()
                .then(a => {
                    if (active) setAccounts(a)
                })
                .catch(() => {})
            void window.personal
                .settings()
                .then(s => {
                    if (active && !debounceTimerRef.current) {
                        settingsRef.current = s
                        savedSnapshotRef.current = s
                        setSettings(s)
                    }
                })
                .catch(() => {})
        })
        return () => {
            active = false
            off()
        }
    }, [])

    useEffect(() => {
        if (!STATUS_POLL_SECTIONS.has(section)) return
        let active = true
        const poll = () => {
            window.personal
                .status()
                .then(st => {
                    if (active) setStatus(st)
                })
                .catch(() => {})
        }
        poll()
        const timer = setInterval(poll, 1500)
        return () => {
            active = false
            clearInterval(timer)
        }
    }, [section])

    return {
        section,
        setSection,
        settings,
        autoSaveState,
        status,
        message,
        error,
        busy,
        accounts,
        setAccounts,
        site,
        setSite,
        host,
        setHost,
        container,
        setContainer,
        remove,
        setRemove,
        mode,
        setMode,
        testUrl,
        setTestUrl,
        act,
        saveImmediate,
        updateDraft,
        flushDraft,
        refreshSettings,
    }
}
