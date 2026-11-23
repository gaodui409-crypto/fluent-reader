import * as React from "react"
import { useMemo, useState } from "react"
import {
    DefaultButton,
    PrimaryButton,
    TextField,
    MessageBar,
    MessageBarType,
    Spinner,
    Pivot,
    PivotItem,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import {
    accountFeed,
    linuxDoPresets,
    linuxDoTags,
    LinuxDoChoice,
    LinuxDoAccount,
    LINUXDO,
} from "../../linuxdo"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { addSource } from "../../scripts/models/source"
import { createSourceGroup, addSourceToGroup } from "../../scripts/models/group"
import { loadPreferences } from "../../scripts/models/preferences"

const useStyles = makeStyles({
    root: {
        border: "1px solid var(--neutralQuaternary)",
        borderRadius: "8px",
        padding: "12px",
        marginTop: "12px",
    },
    row: {
        display: "flex",
        gap: "8px",
        alignItems: "end",
        flexWrap: "wrap",
    },
    headerRow: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "8px",
        marginTop: "12px",
        maxHeight: "320px",
        overflowY: "auto",
    },
    entry: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "6px",
    },
    name: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
    hint: {
        color: "var(--neutralSecondary)",
        lineHeight: "1.6",
        margin: "8px 0",
    },
    field: { minWidth: "180px", flex: 1 },
})

function buildCategoryNameMap(list: LinuxDoChoice[]): Map<number, string> {
    const map = new Map<number, string>()
    for (const item of list) {
        const match = item.url.match(/\/c\/[^/]+\/(\d+)\.(?:rss|json)$/)
        if (match) {
            const id = Number(match[1])
            if (Number.isSafeInteger(id)) {
                map.set(id, item.title)
            }
        }
    }
    return map
}

function withParentCategoryNames(
    items: LinuxDoChoice[],
    referenceAll: LinuxDoChoice[]
): LinuxDoChoice[] {
    const nameMap = buildCategoryNameMap(referenceAll)
    return items.map(item => {
        if (item.parentId && nameMap.has(item.parentId)) {
            const parentName = nameMap.get(item.parentId)
            if (parentName && !item.title.startsWith(parentName + " / ")) {
                return {
                    ...item,
                    title: `${parentName} / ${item.title}`,
                }
            }
        }
        return item
    })
}

export function LinuxDoSubscriptions() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const sources = useAppSelector(s => s.sources)

    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState("common")
    const [categoryQuery, setCategoryQuery] = useState("")
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<LinuxDoChoice[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [account, setAccount] = useState<LinuxDoAccount>(null)
    const [tagSearched, setTagSearched] = useState(false)
    const [tags, setTags] = useState<LinuxDoChoice[]>(linuxDoTags)

    async function run(work: () => Promise<void>) {
        setBusy(true)
        setError("")
        setNotice("")
        try {
            await work()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function subscribe(choice: LinuxDoChoice) {
        await run(async () => {
            const sid = await dispatch(
                addSource(choice.url, "LINUX DO · " + choice.title, false, true)
            )
            const gid = dispatch(createSourceGroup("Linux.do"))
            dispatch(addSourceToGroup(gid, sid))
            if (choice.url.endsWith(".json")) {
                await window.personal.savePreferences(
                    { sids: [sid] },
                    { openTarget: 3 },
                    []
                )
                await dispatch(loadPreferences())
                setNotice(
                    `已添加「${choice.title}」，位于 Linux.do 分组，并已自动设为「抓取全文」直接阅读主楼完整内容。`
                )
            } else {
                setNotice(`已添加「${choice.title}」，位于 Linux.do 分组。`)
            }
        })
    }

    const formattedPublicCategories = useMemo(() => {
        const publicLoaded = results.filter(
            c => c.url.includes("/c/") && !c.restricted
        )
        const base = publicLoaded.length
            ? withParentCategoryNames(publicLoaded, results)
            : linuxDoPresets.filter(c => c.url.includes("/c/"))
        const kw = categoryQuery.trim().toLowerCase()
        return kw ? base.filter(c => c.title.toLowerCase().includes(kw)) : base
    }, [results, categoryQuery])

    const formattedRestrictedCategories = useMemo(() => {
        if (!account?.categories) return []
        const withParents = withParentCategoryNames(
            account.categories.filter(c => c.restricted),
            account.categories
        )
        return withParents.map(accountFeed)
    }, [account])

    function choices(rows: LinuxDoChoice[]) {
        return (
            <div className={classes.grid}>
                {rows.map(c => {
                    const exists = Object.values(sources).some(
                        s => !s.archived && s.url === c.url
                    )
                    return (
                        <div key={c.url} className={classes.entry}>
                            <span className={classes.name}>
                                {c.title}
                                {c.restricted ? " · 限定访问" : ""}
                            </span>
                            <DefaultButton
                                disabled={busy || exists}
                                ariaLabel={`${exists ? "已订阅" : "订阅"} ${
                                    c.title
                                }`}
                                onClick={() => void subscribe(c)}>
                                {exists ? "已订阅" : "订阅"}
                            </DefaultButton>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <section className={classes.root} aria-label="Linux.do 订阅">
            <div className={classes.headerRow}>
                <strong>LINUX DO</strong>
                <span className={classes.name}>
                    按分类、标签订阅感兴趣的主题
                </span>
                <DefaultButton onClick={() => setOpen(!open)}>
                    {open ? "收起" : "选择订阅"}
                </DefaultButton>
            </div>
            {open && (
                <>
                    <Pivot
                        selectedKey={tab}
                        onLinkClick={item => {
                            if (!item) return
                            setTab(item.props.itemKey)
                            setError("")
                            setNotice("")
                        }}>
                        <PivotItem headerText="常用订阅" itemKey="common" />
                        <PivotItem headerText="分类" itemKey="categories" />
                        <PivotItem headerText="标签" itemKey="tags" />
                        <PivotItem
                            headerText="账号与等级帖"
                            itemKey="account"
                        />
                    </Pivot>
                    {tab === "common" && (
                        <>
                            <p className={classes.hint}>
                                推荐订阅「最新主题」；「最新回复」会推送同一帖子的后续回帖。「每小时热门榜单」在软件运行期间每小时记录一次排名变化。
                            </p>
                            {choices(linuxDoPresets)}
                        </>
                    )}
                    {tab === "categories" && (
                        <>
                            <p className={classes.hint}>
                                下方为常用公开分类，点击「读取网站分类」可拉取完整父子分类目录；需登录等级权限的分类请切到「账号与等级帖」查看。
                            </p>
                            <div className={classes.row}>
                                <TextField
                                    className={classes.field}
                                    label="筛选分类"
                                    placeholder="输入分类或子分类名称…"
                                    spellCheck={false}
                                    autoCorrect="off"
                                    value={categoryQuery}
                                    onChange={(_, v) =>
                                        setCategoryQuery(v || "")
                                    }
                                />
                                <DefaultButton
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            setResults(
                                                await window.personal.linuxDoCatalog(
                                                    "categories"
                                                )
                                            )
                                        })
                                    }>
                                    读取网站分类
                                </DefaultButton>
                            </div>
                            {choices(formattedPublicCategories)}
                            {categoryQuery.trim() &&
                                !formattedPublicCategories.length && (
                                    <p className={classes.hint}>
                                        没有匹配的公开分类，可点击「读取网站分类」拉取全部目录后再筛选。
                                    </p>
                                )}
                        </>
                    )}
                    {tab === "tags" && (
                        <>
                            <p className={classes.hint}>
                                按 Linux.do 站内标签订阅主题（如
                                codex、grok）。若搜索时提示需要验证，请先切到「账号与等级帖」打开登录窗口。
                            </p>
                            <form
                                className={classes.row}
                                onSubmit={e => {
                                    e.preventDefault()
                                    void run(async () => {
                                        const found =
                                            await window.personal.linuxDoCatalog(
                                                "tags",
                                                query
                                            )
                                        setTags(found)
                                        setTagSearched(true)
                                        if (!found.length)
                                            setNotice(
                                                "未找到匹配标签，可打开网站标签页面确认名称。"
                                            )
                                    })
                                }}>
                                <TextField
                                    className={classes.field}
                                    label="搜索 Linux.do 标签"
                                    spellCheck={false}
                                    autoCorrect="off"
                                    value={query}
                                    onChange={(_, v) => setQuery(v || "")}
                                />
                                <PrimaryButton disabled={busy} type="submit">
                                    搜索标签
                                </PrimaryButton>
                            </form>
                            {choices(tags)}
                            {tagSearched && !tags.length && (
                                <p>没有匹配的标签。</p>
                            )}
                            <DefaultButton
                                disabled={busy}
                                onClick={() =>
                                    void window.utils.openExternal(
                                        LINUXDO + "/tags"
                                    )
                                }>
                                在网站查看标签
                            </DefaultButton>
                        </>
                    )}
                    {tab === "account" && (
                        <>
                            <p className={classes.hint}>
                                连接账号后可订阅当前权限内的限制分类主题（公开
                                RSS 不含等级帖）。请先点击「打开 Linux.do
                                登录窗口」完成登录与验证，再点击「检查账号可读内容」。若内置窗口反复卡在
                                Cloudflare
                                验证，说明当前网络环境受限，请改用系统浏览器阅读（外部浏览器的登录状态不会同步到本软件）。
                            </p>
                            <div className={classes.headerRow}>
                                <DefaultButton
                                    onClick={() =>
                                        void window.utils.openExternal(LINUXDO)
                                    }>
                                    用系统浏览器打开
                                </DefaultButton>
                                <DefaultButton
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            await window.personal.linuxDoOpen()
                                            setNotice(
                                                "请在网站窗口完成登录或验证，然后回来检查连接。"
                                            )
                                        })
                                    }>
                                    打开 Linux.do 登录窗口
                                </DefaultButton>
                                <PrimaryButton
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            setAccount(null)
                                            const value =
                                                await window.personal.linuxDoAccount()
                                            setAccount(value)
                                            if (!value.loggedIn)
                                                setNotice(
                                                    "尚未登录，请在网站窗口完成登录。"
                                                )
                                        })
                                    }>
                                    检查账号可读内容
                                </PrimaryButton>
                            </div>
                            {account?.loggedIn && (
                                <>
                                    <p>
                                        已连接 @{account.username}
                                        {account.level !== undefined
                                            ? ` · 等级 ${account.level}`
                                            : ""}
                                        。当前主题列表 {account.topicCount}{" "}
                                        篇，其中已识别限定分类主题{" "}
                                        {account.restrictedTopicCount} 篇。
                                    </p>
                                    <p className={classes.hint}>
                                        账号订阅会自动开启「自动抓取全文」，点开帖子即可直接加载主楼完整内容。此处的检查数量不代表全部历史帖子。
                                    </p>
                                    {choices([
                                        {
                                            title: "账号可见的新主题",
                                            url: LINUXDO + "/latest.json",
                                        },
                                        ...formattedRestrictedCategories,
                                    ])}
                                </>
                            )}
                        </>
                    )}
                    {busy && <Spinner label="正在连接…" />}
                    {notice && <MessageBar>{notice}</MessageBar>}
                    {error && (
                        <MessageBar messageBarType={MessageBarType.error}>
                            {error}
                            <br />
                            若网站数据无法读取，可切到「账号与等级帖」完成登录或验证后重试。
                        </MessageBar>
                    )}
                </>
            )}
        </section>
    )
}
