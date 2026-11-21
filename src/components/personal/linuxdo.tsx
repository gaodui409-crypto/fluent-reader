import * as React from "react"
import { useState } from "react"
import {
    DefaultButton,
    PrimaryButton,
    TextField,
    MessageBar,
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
        alignItems: "center",
        flexWrap: "wrap",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
    field: { minWidth: "160px", flex: 1 },
})
export function LinuxDoSubscriptions() {
    const classes = useStyles(),
        dispatch = useAppDispatch()
    const sources = useAppSelector(s => s.sources)
    const [open, setOpen] = useState(false),
        [tab, setTab] = useState("common")
    const [query, setQuery] = useState(""),
        [results, setResults] = useState<LinuxDoChoice[]>([])
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [notice, setNotice] = useState("")
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
            setNotice(`已添加「${choice.title}」，位于 Linux.do 分组。`)
        })
    }
    function choices(rows: LinuxDoChoice[]) {
        return (
            <div className={classes.grid}>
                {rows.map(c => {
                    const exists = Object.values(sources).some(
                        s => s.url === c.url
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
            <div className={classes.row}>
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
                                推荐“最新主题”；“最新回复”会包含同一主题的不同楼层。榜单每小时最多保存一次有变化的排名，应用需保持运行。
                            </p>
                            {choices(linuxDoPresets)}
                        </>
                    )}
                    {tab === "categories" && (
                        <>
                            <p className={classes.hint}>
                                常用公开分类可直接订阅；读取网站目录可查看更多分类。限定访问分类请在“账号与等级帖”中检查。
                            </p>
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
                            {choices(
                                results.filter(
                                    c => c.url.includes("/c/") && !c.restricted
                                ).length
                                    ? results.filter(
                                          c =>
                                              c.url.includes("/c/") &&
                                              !c.restricted
                                      )
                                    : linuxDoPresets.filter(c =>
                                          c.url.includes("/c/")
                                      )
                            )}
                        </>
                    )}
                    {tab === "tags" && (
                        <>
                            <p className={classes.hint}>
                                这是网站自身的标签订阅。搜索例如
                                codex、grok；网站要求验证时，先打开登录窗口。
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
                                实验性账号主题订阅：只读取当前账号能访问的内容。先在网站窗口登录，再检查。账号等级高不保证公开
                                RSS 包含等级帖。
                            </p>
                            <p className={classes.hint}>
                                若 Cloudflare
                                验证反复循环，说明此内嵌连接尚未通过网站验证。请使用系统浏览器阅读，账号订阅暂不可用；浏览器登录不会自动同步到本软件。
                            </p>
                            <div className={classes.row}>
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
                                        账号订阅先保存主题标题与摘要，阅读主楼时点击“抓取全文”。此处的检查数量不代表全部历史内容。
                                    </p>
                                    {choices([
                                        {
                                            title: "账号可见的新主题（实验）",
                                            url: LINUXDO + "/latest.json",
                                        },
                                        ...account.categories
                                            .filter(c => c.restricted)
                                            .map(accountFeed),
                                    ])}
                                </>
                            )}
                        </>
                    )}
                    {busy && <Spinner label="正在连接…" />}
                    {notice && <MessageBar>{notice}</MessageBar>}
                    {error && (
                        <MessageBar>
                            {error}
                            <br />
                            网站数据无法读取时，可打开“账号与等级帖”完成登录或验证后重试。
                        </MessageBar>
                    )}
                </>
            )}
        </section>
    )
}
