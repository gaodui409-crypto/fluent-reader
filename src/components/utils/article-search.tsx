import * as React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import intl from "react-intl-universal"
import { Async } from "@fluentui/react"
import {
    Button,
    SearchBox,
    Menu,
    MenuTrigger,
    MenuPopover,
    MenuList,
    MenuItemRadio,
    MenuItemCheckbox,
    MenuDivider,
} from "@fluentui/react-components"
import { makeStyles, mergeClasses, shorthands } from "@griffel/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { validateRegex } from "../../scripts/utils"
import { performSearch, configureSearch } from "../../scripts/models/page"
import { FilterType } from "../../scripts/models/feed"

const useStyles = makeStyles({
    root: {
        "&.fui-SearchBox": shorthands.borderStyle("none"),
        "maxWidth": "none",
        "WebkitAppRegion": "no-drag",
        "boxShadow":
            "0 1.6px 3.6px 0 rgba(0, 0, 0, 0.132), 0 0.3px 0.9px 0 rgba(0, 0, 0, 0.108)",
    },
    inline: {
        minWidth: 0,
        flexShrink: 0,
        height: "32px",
        margin: "8px 12px",
    },
    floating: {
        "&.fui-SearchBox": {
            position: "absolute",
            minHeight: 0,
            minWidth: 0,
        },
        "zIndex": 4,
        "top": 0,
        "left": "36px",
        "width": "100%",
        "maxWidth": "calc(100% - 484px)",
        "margin": "4px 16px",
        "height": "calc(var(--navHeight) - 4px)",
    },
    floatingDarwin: {
        "&:is(body.not-fullscreen *)": {
            left: "108px",
            maxWidth: "calc(100% - 384px)",
        },
    },
    floatingMenu: {
        "@media (min-width: 1280px)": {
            left: "var(--sidebarWidth, 276px)",
            maxWidth: "calc(100% - 728px)",
        },
    },
    floatingDarwinMenu: {
        "@media (min-width: 1280px)": {
            "left": "var(--sidebarWidth, 276px)",
            "maxWidth": "calc(100% - 556px)",
            "&:is(body.not-fullscreen *)": {
                left: "var(--sidebarWidth, 276px)",
                maxWidth: "calc(100% - 556px)",
            },
        },
    },
})

export default function ArticleSearch({
    inline = false,
    styleClass,
}: {
    inline?: boolean
    styleClass?: string
}) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const searchOn = useAppSelector(state => state.page.searchOn)
    const initQuery = useAppSelector(state => state.page.filter.search)
    const filterType = useAppSelector(state => state.page.filter.type)
    const keywordMode = !!(filterType & FilterType.KeywordSearch)
    const menuOn = useAppSelector(state => state.app.menu)
    const [query, setQuery] = useState(initQuery)
    const input = useRef<HTMLInputElement>(null)
    const [availableWidth, setAvailableWidth] = useState<number>()
    const isDarwin = window.utils.platform === "darwin"

    useLayoutEffect(() => {
        if (inline || !searchOn) return
        const box = document.querySelector<HTMLElement>(".article-search")
        const actions = document.getElementById("mark-all-toggle")
            ?.previousElementSibling as HTMLElement
        if (!box || !actions || !actions.parentElement) return
        const measure = () =>
            setAvailableWidth(
                Math.max(
                    0,
                    actions.getBoundingClientRect().left -
                        box.getBoundingClientRect().left -
                        8
                )
            )
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(actions.parentElement)
        window.addEventListener("resize", measure)
        return () => {
            observer.disconnect()
            window.removeEventListener("resize", measure)
        }
    }, [inline, searchOn, menuOn])

    const search = useMemo(() => {
        const scheduler = new Async()
        return {
            run: scheduler.debounce((value: string) => {
                if (keywordMode || validateRegex(value) !== null)
                    dispatch(performSearch(value))
            }, 500),
            dispose: () => scheduler.dispose(),
        }
    }, [dispatch, keywordMode])

    useEffect(() => search.dispose, [search])
    useEffect(() => {
        search.run(query)
    }, [search])
    useEffect(() => {
        if (searchOn) {
            setQuery(initQuery)
            input.current?.focus()
        }
    }, [searchOn])

    return searchOn ? (
        <SearchBox
            ref={input}
            style={!inline ? { maxWidth: availableWidth } : undefined}
            className={mergeClasses(
                !inline && "article-search",
                classes.root,
                inline ? classes.inline : classes.floating,
                !inline && isDarwin && classes.floatingDarwin,
                !inline && menuOn && classes.floatingMenu,
                !inline && menuOn && isDarwin && classes.floatingDarwinMenu,
                styleClass
            )}
            placeholder={intl.get(
                keywordMode ? "rules.searchPlaceholder" : "rules.regex"
            )}
            aria-label={intl.get("search")}
            aria-invalid={!keywordMode && validateRegex(query) === null}
            contentBefore={
                <Menu
                    checkedValues={{
                        mode: [keywordMode ? "keywords" : "regex"],
                        match: [
                            filterType & FilterType.MatchAll ? "all" : "any",
                        ],
                        scope: [
                            filterType & FilterType.FullSearch
                                ? "full"
                                : filterType & FilterType.CreatorSearch
                                ? "author"
                                : filterType & FilterType.BodySearch
                                ? "body"
                                : "title",
                        ],
                        exclude:
                            filterType & FilterType.ExcludeSearch
                                ? ["yes"]
                                : [],
                        case:
                            filterType & FilterType.CaseInsensitive
                                ? []
                                : ["yes"],
                    }}
                    onCheckedValueChange={(_, data) => {
                        let next = filterType
                        if (data.name === "mode")
                            next =
                                data.checkedItems[0] === "keywords"
                                    ? next | FilterType.KeywordSearch
                                    : next & ~FilterType.KeywordSearch
                        if (data.name === "match")
                            next =
                                data.checkedItems[0] === "all"
                                    ? next | FilterType.MatchAll
                                    : next & ~FilterType.MatchAll
                        if (data.name === "exclude")
                            next = data.checkedItems.length
                                ? next | FilterType.ExcludeSearch
                                : next & ~FilterType.ExcludeSearch
                        if (data.name === "case")
                            next = data.checkedItems.length
                                ? next & ~FilterType.CaseInsensitive
                                : next | FilterType.CaseInsensitive
                        if (data.name === "scope") {
                            next &= ~(
                                FilterType.FullSearch |
                                FilterType.CreatorSearch |
                                FilterType.BodySearch
                            )
                            if (data.checkedItems[0] === "full")
                                next |= FilterType.FullSearch
                            if (data.checkedItems[0] === "author")
                                next |= FilterType.CreatorSearch
                            if (data.checkedItems[0] === "body")
                                next |= FilterType.BodySearch
                        }
                        dispatch(configureSearch(next))
                    }}>
                    <MenuTrigger disableButtonEnhancement>
                        <Button
                            appearance="subtle"
                            size="small"
                            aria-label={intl.get("rules.searchOptions")}>
                            {intl.get(
                                keywordMode ? "rules.keywords" : "rules.regex"
                            )}
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItemRadio name="mode" value="keywords">
                                {intl.get("rules.keywords")}
                            </MenuItemRadio>
                            <MenuItemRadio name="mode" value="regex">
                                {intl.get("rules.regex")}
                            </MenuItemRadio>
                            <MenuDivider />
                            <MenuItemRadio
                                disabled={!keywordMode}
                                name="match"
                                value="any">
                                {intl.get("rules.anyWords")}
                            </MenuItemRadio>
                            <MenuItemRadio
                                disabled={!keywordMode}
                                name="match"
                                value="all">
                                {intl.get("rules.allWords")}
                            </MenuItemRadio>
                            <MenuItemCheckbox name="exclude" value="yes">
                                {intl.get("rules.excludeResults")}
                            </MenuItemCheckbox>
                            <MenuDivider />
                            <MenuItemRadio name="scope" value="title">
                                {intl.get("rules.title")}
                            </MenuItemRadio>
                            <MenuItemRadio name="scope" value="body">
                                {intl.get("rules.content")}
                            </MenuItemRadio>
                            <MenuItemRadio name="scope" value="full">
                                {intl.get("rules.fullSearch")}
                            </MenuItemRadio>
                            <MenuItemRadio name="scope" value="author">
                                {intl.get("rules.creator")}
                            </MenuItemRadio>
                            <MenuDivider />
                            <MenuItemCheckbox name="case" value="yes">
                                {intl.get("context.caseSensitive")}
                            </MenuItemCheckbox>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            }
            value={query}
            dismiss={
                query
                    ? {
                          "aria-label": intl.get("cancel"),
                          "tabIndex": 0,
                          "onKeyDown": event => {
                              if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault()
                                  event.currentTarget.click()
                              }
                          },
                      }
                    : null
            }
            onChange={(_, { value }) => {
                setQuery(value)
                search.run(value)
            }}
            onKeyDown={event => {
                if (event.key === "Escape" && query) {
                    event.preventDefault()
                    event.stopPropagation()
                    setQuery("")
                    search.run("")
                }
            }}
        />
    ) : null
}
