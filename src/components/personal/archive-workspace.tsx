import * as React from "react"
import { useEffect, useRef, useState } from "react"
import {
    Checkbox,
    DefaultButton,
    Dialog,
    DialogFooter,
    Dropdown,
    MessageBar,
    PrimaryButton,
    TextField,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    ArchiveAction,
    ArchivePreview,
    ArchiveQuery,
    ArchiveResult,
    ArchiveRule,
    archivePattern,
    emptyArchiveQuery,
} from "../../archive-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { refreshArchive } from "../../scripts/models/archive"
import { showArchiveMatches } from "../../scripts/models/page"
import { FilterType } from "../../scripts/models/feed"
import { FolderPicker } from "./folders"

export function openOrganize(value?: unknown) {
    const rule = value as ArchiveRule
    window.dispatchEvent(
        new CustomEvent("organize-articles", {
            detail: rule?.query && rule?.id ? rule : undefined,
        })
    )
}
const useStyles = makeStyles({
    selection: {
        position: "relative",
        zIndex: 4,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        backgroundColor: "var(--neutralLighterAlt)",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        boxSizing: "border-box",
    },
    inset: { "@media (min-width:1440px)": { marginLeft: "280px" } },
    form: { display: "grid", gap: "12px" },
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    results: {
        maxHeight: "230px",
        overflowY: "auto",
        border: "1px solid var(--neutralQuaternaryAlt)",
        padding: "8px",
    },
})

export function ArticleSelectionBar() {
    const c = useStyles(),
        dispatch = useAppDispatch(),
        selected = useAppSelector(s => s.organize.selected)
    const settings = useAppSelector(s => s.app.settings.display),
        menu = useAppSelector(s => s.app.menu)
    const feed = useAppSelector(s => s.feeds[s.page.feedId])
    const [folders, setFolders] = useState(false),
        [folderId, setFolderId] = useState<number>()
    const [busy, setBusy] = useState(false),
        [message, setMessage] = useState(""),
        [result, setResult] = useState<ArchiveResult>()
    const ref = useRef<HTMLElement>(null)
    useEffect(() => {
        const receive = (
            e: CustomEvent<{ result?: ArchiveResult; message: string }>
        ) => {
            setResult(e.detail.result)
            setMessage(e.detail.message)
        }
        window.addEventListener("archive-result", receive)
        return () => window.removeEventListener("archive-result", receive)
    }, [])
    useEffect(() => {
        const n = ref.current
        const update = () =>
            document.documentElement.style.setProperty(
                "--selectionHeight",
                (!settings && n ? n.getBoundingClientRect().height : 0) + "px"
            )
        update()
        if (!n) return
        const o = new ResizeObserver(update)
        o.observe(n)
        return () => {
            o.disconnect()
            document.documentElement.style.setProperty(
                "--selectionHeight",
                "0px"
            )
        }
    }, [selected.length, settings, message, folders])
    async function run(action: ArchiveAction) {
        setBusy(true)
        setMessage("")
        try {
            const r = await window.personal.archiveApply(selected, action)
            setResult(r)
            setFolders(false)
            setMessage(
                `已处理 ${r.count} 篇${await dispatch(refreshArchive(r))}`
            )
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }
    async function undo() {
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
    if (settings || (!selected.length && !message)) return null
    return (
        <section
            ref={ref}
            role="toolbar"
            aria-label="文章选择"
            className={mergeClasses(c.selection, menu && c.inset)}>
            {!!selected.length && (
                <>
                    <strong>已选 {selected.length} 篇</strong>
                    <PrimaryButton
                        disabled={busy}
                        onClick={() => void run({ kind: "read" })}>
                        标为已读
                    </PrimaryButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void run({ kind: "star" })}>
                        收藏
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void run({ kind: "later" })}>
                        稍后读
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => setFolders(!folders)}>
                        加入文件夹
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        menuProps={{
                            items: [
                                ...[
                                    ["unread", "标为未读"],
                                    ["unstar", "取消收藏"],
                                    ["unlater", "移出稍后读"],
                                    ["hide", "隐藏"],
                                    ["restore", "恢复到订阅流"],
                                ].map(([kind, text]) => ({
                                    key: kind,
                                    text,
                                    onClick: () =>
                                        void run({
                                            kind: kind as ArchiveAction["kind"],
                                        }),
                                })),
                                ...(feed?.filter.folderId
                                    ? [
                                          {
                                              key: "remove",
                                              text: "移出当前文件夹",
                                              onClick: () =>
                                                  void run({
                                                      kind: "remove",
                                                      folderId:
                                                          feed.filter.folderId,
                                                  }),
                                          },
                                      ]
                                    : []),
                            ],
                        }}>
                        更多操作
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => {
                            dispatch({ type: "CLEAR_SELECTION" })
                            setFolders(false)
                        }}>
                        取消选择
                    </DefaultButton>
                </>
            )}
            {folders && !!selected.length && (
                <div style={{ width: "100%", maxWidth: 500 }}>
                    <FolderPicker
                        value={folderId}
                        onChange={setFolderId}
                        disabled={busy}
                    />
                    <div className={c.row} style={{ marginTop: 8 }}>
                        <PrimaryButton
                            disabled={busy || !folderId}
                            onClick={() =>
                                void run({ kind: "folder", folderId })
                            }>
                            加入所选文件夹
                        </PrimaryButton>
                        {!!feed?.filter.folderId && (
                            <DefaultButton
                                disabled={busy || !folderId}
                                onClick={() =>
                                    void run({
                                        kind: "folder",
                                        folderId,
                                        fromFolderId: feed.filter.folderId,
                                    })
                                }>
                                从当前文件夹移动
                            </DefaultButton>
                        )}
                    </div>
                </div>
            )}
            {!!message && (
                <>
                    <span role="status">{message}</span>
                    {result?.count > 0 && (
                        <DefaultButton
                            disabled={busy}
                            onClick={() => void undo()}>
                            撤销
                        </DefaultButton>
                    )}
                    <DefaultButton
                        disabled={busy}
                        onClick={() => setMessage("")}>
                        收起提示
                    </DefaultButton>
                </>
            )}
        </section>
    )
}

export default function OrganizePanel() {
    const c = useStyles(),
        dispatch = useAppDispatch(),
        feed = useAppSelector(s => s.feeds[s.page.feedId]),
        title = useAppSelector(s => s.app.title),
        menuKey = useAppSelector(s => s.app.menuKey)
    const [open, setOpen] = useState(false),
        [query, setQuery] = useState<ArchiveQuery>(emptyArchiveQuery)
    const [scope, setScope] = useState("all"),
        [kind, setKind] = useState("folder"),
        [folderId, setFolderId] = useState<number>()
    const [hide, setHide] = useState(false),
        [future, setFuture] = useState(false),
        [advanced, setAdvanced] = useState(false)
    const [preview, setPreview] = useState<ArchivePreview>(),
        [excluded, setExcluded] = useState<number[]>([])
    const [busy, setBusy] = useState(false),
        [loading, setLoading] = useState(false),
        [message, setMessage] = useState("")
    const [ruleId, setRuleId] = useState(""),
        [ruleName, setRuleName] = useState(""),
        [result, setResult] = useState<ArchiveResult>()
    const [page, setPage] = useState(0),
        [previewVersion, setPreviewVersion] = useState(0)
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
            } else {
                const f = feed?.filter
                const q = {
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
                    q["regex"] = f.search
                    q.include = ""
                }
                if (f?.type & FilterType.ExcludeSearch) {
                    if (q["regex"] !== undefined)
                        q["regex"] =
                            "^(?![\\s\\S]*(?:" + q["regex"] + "))[\\s\\S]*$"
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
    useEffect(() => {
        if (!open) return
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
        }, 400)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [open, key, previewVersion])
    const change = (patch: Partial<ArchiveQuery>) =>
        setQuery(q => ({ ...q, ...patch }))
    const total = (preview?.rows.length || 0) - excluded.length
    async function execute() {
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
                `操作结果：${String(e)}${
                    completed
                        ? `；本次已处理 ${completed.count} 篇，可撤销。可用“只保存规则”重试规则保存。`
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
    return (
        <Dialog
            hidden={!open}
            onDismiss={() => !busy && setOpen(false)}
            minWidth={560}
            maxWidth={760}
            modalProps={{
                isBlocking: busy,
                styles: {
                    main: {
                        maxHeight: "90vh",
                        minWidth: "min(560px, calc(100vw - 24px))",
                        maxWidth: "min(760px, calc(100vw - 24px))",
                    },
                },
            }}
            dialogContentProps={{ title: "筛选归档" }}>
            <div className={c.form}>
                <Dropdown
                    label="查找范围"
                    selectedKey={scope}
                    disabled={busy}
                    options={[
                        { key: "all", text: "全部文章库" },
                        { key: "current", text: "当前订阅范围 · " + title },
                        ...(scope === "saved"
                            ? [{ key: "saved", text: "这条规则保存的订阅范围" }]
                            : []),
                    ]}
                    onChange={(_, o) => setScope(String(o.key))}
                />
                <TextField
                    label="包含这些内容"
                    placeholder="输入关键词或短语，用逗号分隔"
                    value={query.include}
                    disabled={busy || query.regex !== undefined}
                    onChange={(_, v) => change({ include: v })}
                />
                <TextField
                    label="排除这些内容"
                    placeholder="可留空"
                    value={query.exclude}
                    disabled={busy}
                    onChange={(_, v) => change({ exclude: v })}
                />
                <div className={c.row}>
                    <Dropdown
                        label="匹配方式"
                        selectedKey={query.all ? "all" : "any"}
                        disabled={busy}
                        options={[
                            { key: "any", text: "任意满足" },
                            { key: "all", text: "全部满足" },
                        ]}
                        onChange={(_, o) => change({ all: o.key === "all" })}
                    />
                    <Dropdown
                        label="搜索内容"
                        selectedKey={query.field}
                        disabled={busy}
                        options={[
                            { key: "full", text: "标题及本地正文" },
                            { key: "title", text: "标题" },
                            { key: "body", text: "本地正文" },
                            { key: "author", text: "作者" },
                            { key: "link", text: "原文链接" },
                        ]}
                        onChange={(_, o) =>
                            change({ field: o.key as ArchiveQuery["field"] })
                        }
                    />
                    <DefaultButton
                        disabled={busy}
                        onClick={() => setAdvanced(!advanced)}>
                        高级条件
                    </DefaultButton>
                </div>
                {advanced && (
                    <>
                        <TextField
                            label="自动生成的正则"
                            readOnly
                            value={archivePattern(query)}
                        />
                        <Checkbox
                            disabled={busy}
                            label="手动编辑正则"
                            checked={query.regex !== undefined}
                            onChange={(_, v) =>
                                change({
                                    regex: v
                                        ? archivePattern(query)
                                        : undefined,
                                })
                            }
                        />
                        {query.regex !== undefined && (
                            <TextField
                                disabled={busy}
                                label="正则条件"
                                value={query.regex}
                                onChange={(_, v) => change({ regex: v })}
                            />
                        )}
                        <Checkbox
                            disabled={busy}
                            label="区分大小写"
                            checked={!!query.caseSensitive}
                            onChange={(_, v) => change({ caseSensitive: v })}
                        />
                        <div className={c.row}>
                            <TextField
                                disabled={busy}
                                type="date"
                                label="开始日期（可留空）"
                                value={
                                    query.start
                                        ? new Date(
                                              query.start
                                          ).toLocaleDateString("sv-SE")
                                        : ""
                                }
                                onChange={(_, v) =>
                                    change({
                                        start: v
                                            ? +new Date(v + "T00:00:00")
                                            : undefined,
                                    })
                                }
                            />
                            <TextField
                                disabled={busy}
                                type="date"
                                label="结束日期（可留空）"
                                value={
                                    query.end
                                        ? new Date(
                                              query.end - 1
                                          ).toLocaleDateString("sv-SE")
                                        : ""
                                }
                                onChange={(_, v) => {
                                    const end = v
                                        ? new Date(v + "T00:00:00")
                                        : null
                                    if (end) end.setDate(end.getDate() + 1)
                                    change({ end: end ? +end : undefined })
                                }}
                            />
                        </div>
                    </>
                )}
                <div className={c.row}>
                    <div role="status">
                        {loading
                            ? "正在查找…"
                            : preview
                            ? `匹配 ${preview.rows.length} 篇，本次处理 ${total} 篇`
                            : "可重新预览当前条件"}
                    </div>
                    <DefaultButton
                        disabled={busy || loading}
                        onClick={() => setPreviewVersion(v => v + 1)}>
                        重新预览
                    </DefaultButton>
                </div>
                {preview && (
                    <div className={c.results}>
                        {preview.rows
                            .slice(page * 20, page * 20 + 20)
                            .map(row => (
                                <div key={row.id} style={{ padding: "6px 0" }}>
                                    <Checkbox
                                        disabled={busy}
                                        checked={!excluded.includes(row.id)}
                                        label={row.title}
                                        onChange={(_, checked) =>
                                            setExcluded(v =>
                                                checked
                                                    ? v.filter(
                                                          id => id !== row.id
                                                      )
                                                    : [...v, row.id]
                                            )
                                        }
                                    />
                                    <small>
                                        {row.source} ·{" "}
                                        {row.excerpt ? (
                                            <>
                                                {row.excerpt.text.slice(
                                                    0,
                                                    row.excerpt.start
                                                )}
                                                <mark>
                                                    {row.excerpt.text.slice(
                                                        row.excerpt.start,
                                                        row.excerpt.start +
                                                            row.excerpt.length
                                                    )}
                                                </mark>
                                                {row.excerpt.text.slice(
                                                    row.excerpt.start +
                                                        row.excerpt.length
                                                )}
                                            </>
                                        ) : (
                                            row.body.slice(0, 90)
                                        )}
                                    </small>
                                </div>
                            ))}
                        {preview.rows.length > 20 && (
                            <div className={c.row}>
                                <DefaultButton
                                    disabled={!page}
                                    onClick={() => setPage(page - 1)}>
                                    上一页
                                </DefaultButton>
                                <span>
                                    {page + 1} /{" "}
                                    {Math.ceil(preview.rows.length / 20)}
                                </span>
                                <DefaultButton
                                    disabled={
                                        (page + 1) * 20 >= preview.rows.length
                                    }
                                    onClick={() => setPage(page + 1)}>
                                    下一页
                                </DefaultButton>
                            </div>
                        )}
                    </div>
                )}
                <Dropdown
                    label="处理方式"
                    selectedKey={kind}
                    disabled={busy}
                    options={[
                        { key: "folder", text: "归入文件夹" },
                        { key: "view", text: "只看匹配文章" },
                        { key: "hide", text: "隐藏匹配文章" },
                        { key: "restore", text: "恢复到订阅流" },
                        { key: "read", text: "标为已读" },
                        { key: "unread", text: "标为未读" },
                        { key: "star", text: "加入收藏" },
                        { key: "unstar", text: "取消收藏" },
                        { key: "later", text: "加入稍后读" },
                        { key: "unlater", text: "移出稍后读" },
                    ]}
                    onChange={(_, o) => setKind(String(o.key))}
                />
                {kind === "folder" && (
                    <>
                        <FolderPicker
                            value={folderId}
                            onChange={setFolderId}
                            suggestion={query.include}
                            disabled={busy}
                        />
                        <Checkbox
                            label="归档后从订阅流隐藏"
                            checked={hide}
                            disabled={busy}
                            onChange={(_, v) => setHide(v)}
                        />
                        <small>
                            文件夹、收藏和稍后读中仍可查看；已读状态保持。
                        </small>
                    </>
                )}
                {kind !== "view" && (
                    <Checkbox
                        label="以后自动执行此规则"
                        checked={future}
                        disabled={busy}
                        onChange={(_, v) => setFuture(v)}
                    />
                )}
                {future && kind !== "view" && (
                    <>
                        <TextField
                            disabled={busy}
                            label="规则名称"
                            value={ruleName}
                            placeholder={query.include || "文章整理"}
                            onChange={(_, v) => setRuleName(v)}
                        />
                        <small>
                            沿用上述关键词、排除、字段和订阅范围；本次日期及逐条排除不写入长期规则。
                        </small>
                        <DefaultButton
                            disabled={busy || (kind === "folder" && !folderId)}
                            onClick={() => void saveOnly()}>
                            只保存规则
                        </DefaultButton>
                    </>
                )}
                {!!message && <MessageBar>{message}</MessageBar>}
            </div>
            <DialogFooter>
                {result?.count > 0 && (
                    <DefaultButton disabled={busy} onClick={() => void undo()}>
                        撤销本次整理
                    </DefaultButton>
                )}
                <PrimaryButton
                    disabled={
                        busy ||
                        loading ||
                        !preview ||
                        (kind === "folder" && !folderId)
                    }
                    onClick={() => void execute()}>
                    {kind === "view"
                        ? "查看结果"
                        : `执行本次整理（${total} 篇）`}
                </PrimaryButton>
                <DefaultButton disabled={busy} onClick={() => setOpen(false)}>
                    关闭
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}

export function ArchiveRules() {
    const [rules, setRules] = useState<ArchiveRule[]>([]),
        [message, setMessage] = useState("")
    useEffect(() => {
        let active = true
        const load = () =>
            window.personal
                .archiveRules()
                .then(r => {
                    if (active) setRules(r)
                })
                .catch(e => {
                    if (active) setMessage(String(e))
                })
        void load()
        const off = window.personal.onChanged(() => void load())
        return () => {
            active = false
            off()
        }
    }, [])
    const run = async (fn: () => Promise<unknown>) => {
        try {
            await fn()
            setMessage("")
        } catch (e) {
            setMessage(String(e))
        }
    }
    return (
        <section style={{ marginBottom: 20 }}>
            <h3>筛选归档规则</h3>
            <DefaultButton onClick={() => openOrganize()}>
                新建筛选归档规则
            </DefaultButton>
            {rules.map(rule => (
                <div
                    key={rule.id}
                    style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        padding: "10px 0",
                    }}>
                    <Checkbox
                        label={rule.name}
                        checked={rule.enabled}
                        onChange={(_, v) =>
                            void run(() =>
                                window.personal.archiveSaveRule({
                                    ...rule,
                                    enabled: v,
                                })
                            )
                        }
                    />
                    <DefaultButton onClick={() => openOrganize(rule)}>
                        编辑 / 整理现有文章
                    </DefaultButton>
                    <DefaultButton
                        onClick={() =>
                            void run(() =>
                                window.personal.archiveDeleteRule(rule.id)
                            )
                        }>
                        删除规则
                    </DefaultButton>
                    {rule.error && <small>{rule.error}</small>}
                </div>
            ))}
            {message && <MessageBar>{message}</MessageBar>}
        </section>
    )
}
