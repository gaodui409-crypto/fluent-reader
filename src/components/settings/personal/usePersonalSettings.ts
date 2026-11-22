import { useCallback, useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    defaultPersonalSettings,
    PersonalSettings,
    PersonalStatus,
} from "../../../personal-types"

const SETTINGS_SECTIONS = new Set([
    "siteRules",
    "offlineSave",
    "backup",
    "network",
    "health",
])

const STATUS_POLL_SECTIONS = new Set([
    "search",
    "offlineSave",
    "backup",
    "network",
])

export function usePersonalSettings(initialSection = "accounts") {
    const [section, setSection] = useState(initialSection)
    const [settings, setSettings] = useState<PersonalSettings>(
        defaultPersonalSettings
    )
    const [dirty, setDirty] = useState(false)
    const [status, setStatus] = useState<PersonalStatus>()
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [accounts, setAccounts] = useState<{ host: string; count: number }[]>(
        []
    )
    const [site, setSite] = useState("")
    const [host, setHost] = useState("")
    const [container, setContainer] = useState("")
    const [remove, setRemove] = useState("")
    const [mode, setMode] = useState<"direct" | "rendered" | "off">("direct")

    const act = useCallback(async (fn: () => Promise<unknown>) => {
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const result = await fn()
            if (result !== null && result !== false)
                setMessage(
                    typeof result === "string"
                        ? result
                        : intl.get("personal.saved")
                )
        } catch (err) {
            setError(String(err))
        } finally {
            setBusy(false)
        }
    }, [])

    const update = useCallback(
        <K extends keyof PersonalSettings>(
            key: K,
            value: PersonalSettings[K]
        ) => {
            setSettings(current => ({ ...current, [key]: value }))
            setDirty(true)
        },
        []
    )

    const replaceSavedSettings = useCallback((saved: PersonalSettings) => {
        setSettings(saved)
        setDirty(false)
    }, [])

    const saveAllSettings = useCallback(() => {
        return act(async () => {
            const saved = await window.personal.saveSettings(settings)
            setSettings(saved)
            setDirty(false)
            return true
        })
    }, [act, settings])

    useEffect(() => {
        const onJump = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail
            if (detail) setSection(detail)
        }
        window.addEventListener("open-personal-section", onJump)
        return () => window.removeEventListener("open-personal-section", onJump)
    }, [])

    useEffect(() => {
        let active = true
        window.personal
            .settings()
            .then(s => {
                if (active) {
                    setSettings(s)
                    setDirty(false)
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
        const off = window.personal.onChanged(pollStatus)
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
        needsSaveBar: SETTINGS_SECTIONS.has(section),
        settings,
        dirty,
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
        act,
        update,
        replaceSavedSettings,
        saveAllSettings,
    }
}
