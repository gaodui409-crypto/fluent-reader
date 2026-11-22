import { useEffect, useState } from "react"
import {
    ArchiveAction,
    ArchivePreview,
    ArchiveQuery,
    ArchiveResult,
    ArchiveRule,
    emptyArchiveQuery,
} from "../../../archive-types"
import { useAppDispatch, useAppSelector } from "../../../scripts/reducer"
import { refreshArchive } from "../../../scripts/models/archive"
import { showArchiveMatches } from "../../../scripts/models/page"
import { FilterType } from "../../../scripts/models/feed"

export function openOrganize(value?: unknown) {
    const rule = value as ArchiveRule
    window.dispatchEvent(
        new CustomEvent("organize-articles", {
            detail: rule?.query && rule?.id ? rule : undefined,
        })
    )
}

function isUnconstrainedAllQuery(q: ArchiveQuery): boolean {
    return (
        !q.include.trim() &&
        !q.exclude.trim() &&
        q.regex === undefined &&
        q.start === undefined &&
        q.end === undefined &&
        q.sids === undefined &&
        q.gid === undefined
    )
}

export function useOrganizeState() {
    const dispatch = useAppDispatch()
    const feed = useAppSelector(s => s.feeds[s.page.feedId])
    const title = useAppSelector(s => s.app.title)
    const menuKey = useAppSelector(s => s.app.menuKey)

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState<ArchiveQuery>(emptyArchiveQuery)
    const [scope, setScope] = useState("all")
    const [kind, setKind] = useState("folder")
    const [folderId, setFolderId] = useState<number>()
    const [hide, setHide] = useState(false)
    const [future, setFuture] = useState(false)
    const [advanced, setAdvanced] = useState(false)
    const [preview, setPreview] = useState<ArchivePreview>()
    const [excluded, setExcluded] = useState<number[]>([])
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState("")
    const [ruleId, setRuleId] = useState("")
    const [ruleName, setRuleName] = useState("")
    const [result, setResult] = useState<ArchiveResult>()
    const [page, setPage] = useState(0)
    const [previewVersion, setPreviewVersion] = useState(0)

    useEffect(() => {
        const show = (e: CustomEvent<ArchiveRule>) => {
            const rule = e.detail
            if (rule) {
                setQuery(rule.query)
                setScope("saved")
                setKind(rule.action.kind)
                setFolderId(rule.action.folderId)
                setHide(!!rule.action.feedHidden)
                setRuleId(rule.id)
                setRuleName(rule.name)
                setFuture(true)
                setPreviewVersion(1)
            } else {
                const f = feed?.filter
                const q: ArchiveQuery = {
                    ...emptyArchiveQuery,
                    include: f?.search || "",
                    field: (!f?.search || f?.type & FilterType.FullSearch
                        ? "full"
                        : f?.type & FilterType.BodySearch
                        ? "body"
                        : f?.type & FilterType.CreatorSearch
                        ? "author"
                        : "title") as ArchiveQuery["field"],
                    caseSensitive: f?.search
                        ? !(f.type & FilterType.CaseInsensitive)
                        : false,
                    all: !!(f?.type & FilterType.MatchAll),
                }
                if (f?.search && !(f.type & FilterType.KeywordSearch)) {
                    q.regex = f.search
                    q.include = ""
                }
                if (f?.type & FilterType.ExcludeSearch) {
                    if (q.regex !== undefined)
                        q.regex = "^(?![\\s\\S]*(?:" + q.regex + "))[\\s\\S]*$"
                    else {
                        q.exclude = q.include
                        q.include = ""
                    }
                }
                setQuery(q)
                setScope("all")
                setKind("folder")
                setFolderId(undefined)
                setHide(false)
                setRuleId("")
                setRuleName("")
                setFuture(false)
                setPreviewVersion(0)
            }
            setPreview(undefined)
            setExcluded([])
            setMessage("")
            setResult(undefined)
            setOpen(true)
        }
        window.addEventListener("organize-articles", show)
        return () => window.removeEventListener("organize-articles", show)
    }, [feed])

    const effective: ArchiveQuery = {
        ...query,
        ...(scope === "all"
            ? { sids: undefined, gid: undefined }
            : scope === "current"
            ? {
                  sids: menuKey.startsWith("g-") ? undefined : feed?.sids || [],
                  gid: menuKey.startsWith("g-")
                      ? Number(menuKey.slice(2))
                      : undefined,
              }
            : {}),
    }

    const key = JSON.stringify(effective)
    const waitingForCriteria =
        isUnconstrainedAllQuery(effective) && previewVersion === 0

    useEffect(() => {
        if (!open) return
        if (waitingForCriteria) {
            setLoading(false)
            setPreview(undefined)
            setExcluded([])
            setPage(0)
            return
        }
        let active = true
        setLoading(true)
        setPreview(undefined)
        setExcluded([])
        setPage(0)
        const timer = setTimeout(() => {
            window.personal
                .archivePreview(effective)
                .then(p => {
                    if (active) {
                        setPreview(p)
                        setMessage("")
                    }
                })
                .catch(e => {
                    if (active) setMessage(String(e))
                })
                .finally(() => {
                    if (active) setLoading(false)
                })
        }, 320)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [open, key, previewVersion, waitingForCriteria])

    const change = (patch: Partial<ArchiveQuery>) =>
        setQuery(q => ({ ...q, ...patch }))

    const total = (preview?.rows.length || 0) - excluded.length

    async function execute() {
        if (!preview) return
        setBusy(true)
        setMessage("")
        let completed: ArchiveResult | undefined
        const stableRuleId = ruleId || crypto.randomUUID()
        setRuleId(stableRuleId)
        const action: ArchiveAction = {
            kind: kind as ArchiveAction["kind"],
            folderId: kind === "folder" ? folderId : undefined,
            feedHidden: hide,
        }
        try {
            if (kind === "view") {
                await dispatch(
                    showArchiveMatches(
                        preview.rows
                            .filter(r => !excluded.includes(r.id))
                            .map(r => r.id)
                    )
                )
                setOpen(false)
                return
            }
            const r = await window.personal.archiveApplyPreview(
                preview.token,
                excluded,
                action
            )
            completed = r
            setResult(r)
            setPreview(undefined)
            const syncWarning = await dispatch(refreshArchive(r))
            setMessage(`本次已处理 ${r.count} 篇${syncWarning}`)
            if (future) {
                const saved = await window.personal.archiveSaveRule({
                    id: stableRuleId,
                    name: ruleName.trim() || query.include.trim() || "文章整理",
                    enabled: true,
                    query: effective,
                    action,
                })
                setRuleId(saved.id)
                setMessage(
                    `本次已处理 ${r.count} 篇；规则已保存，将用于以后收到的文章。${syncWarning}`
                )
            }
        } catch (e) {
            setMessage(
                `${String(e)}${
                    completed
                        ? `（文章已处理 ${completed.count} 篇，可点击下方「撤销本次整理」回退，或点击「只保存规则」单独重试保存规则）`
                        : ""
                }`
            )
        } finally {
            setBusy(false)
        }
    }

    async function saveOnly() {
        setBusy(true)
        const stableRuleId = ruleId || crypto.randomUUID()
        setRuleId(stableRuleId)
        try {
            const r = await window.personal.archiveSaveRule({
                id: stableRuleId,
                name: ruleName.trim() || query.include.trim() || "文章整理",
                enabled: true,
                query: effective,
                action: {
                    kind: kind as ArchiveAction["kind"],
                    folderId: kind === "folder" ? folderId : undefined,
                    feedHidden: hide,
                },
            })
            setRuleId(r.id)
            setMessage("规则已保存；本次没有修改已有文章。")
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function undo() {
        if (!result) return
        setBusy(true)
        try {
            const r = await window.personal.archiveUndo(result.batchId)
            setResult(undefined)
            setMessage(
                `已撤销 ${r.count} 篇${
                    r.skipped ? `，保留 ${r.skipped} 项后续修改` : ""
                }`
            )
            await dispatch(refreshArchive(r))
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }

    return {
        open,
        setOpen,
        title,
        query,
        change,
        scope,
        setScope,
        kind,
        setKind,
        folderId,
        setFolderId,
        hide,
        setHide,
        future,
        setFuture,
        advanced,
        setAdvanced,
        preview,
        excluded,
        setExcluded,
        busy,
        loading,
        waitingForCriteria,
        message,
        ruleName,
        setRuleName,
        result,
        page,
        setPage,
        triggerPreview: () => setPreviewVersion(v => v + 1),
        total,
        execute,
        saveOnly,
        undo,
    }
}
