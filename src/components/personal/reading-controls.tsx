import * as React from "react"
import { useRef, useState } from "react"
import intl from "react-intl-universal"
import { ContextualMenu, DirectionalHint, Icon } from "@fluentui/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { collectionKey } from "../../reading-preferences"
import { saveReadingPreferences } from "../../scripts/models/reading"
import { toggleFilter } from "../../scripts/models/page"
import { FilterType } from "../../scripts/models/feed"
import { FlatButton } from "../utils/FlatButton"
import { makeStyles, mergeClasses } from "@fluentui/react-components"

const useStyles = makeStyles({
    group: {
        display: "inline-flex",
        alignItems: "center",
        height: "var(--navHeight)",
        verticalAlign: "top",
        position: "relative",
        zIndex: 2,
    },
    button: {
        width: "auto",
        height: "var(--navHeight)",
        lineHeight: "20px",
        paddingLeft: "10px",
        paddingRight: "10px",
        whiteSpace: "nowrap",
        fontSize: "12px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
    },
    modeBtn: {
        maxWidth: "152px",
        paddingRight: "8px",
    },
    label: {
        display: "inline-block",
        lineHeight: "20px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    caret: {
        fontSize: "10px",
        color: "var(--neutralSecondary)",
        flexShrink: 0,
    },
})

export function ReadingControls() {
    const dispatch = useAppDispatch()
    const classes = useStyles()
    const key = useAppSelector(s => collectionKey(s.app.menuKey))
    const collections = useAppSelector(s => s.reading.collections)
    const filterType = useAppSelector(s => s.page.filter.type)
    const unread = !(filterType & FilterType.ShowRead)
    const starredOnly = !(filterType & FilterType.ShowNotStarred)

    const modeBtnRef = useRef<HTMLDivElement>(null)
    const [menuOpen, setMenuOpen] = useState(false)

    const currentTarget = key
        ? collections[key]?.openTarget ?? "inherit"
        : "inherit"
    const options = [
        { key: "inherit", text: intl.get("organize.followSource") },
        { key: 0, text: intl.get("organize.rss") },
        { key: 1, text: intl.get("organize.webpage") },
        { key: 3, text: intl.get("organize.fullContent") },
    ]
    const currentLabel =
        options.find(o => o.key === currentTarget)?.text ||
        intl.get("organize.followSource")

    const filterLabel = starredOnly
        ? intl.get("context.starredOnly")
        : intl.get(unread ? "organize.unreadOnly" : "organize.allStates")

    return (
        <span className={classes.group}>
            <FlatButton
                styleClass={classes.button}
                title={intl.get("organize.filterHint")}
                ariaLabel={intl.get("organize.filterHint")}
                onClick={() => dispatch(toggleFilter(FilterType.ShowRead))}>
                <span className={classes.label}>{filterLabel}</span>
            </FlatButton>
            {key && (
                <div ref={modeBtnRef} style={{ display: "inline-flex" }}>
                    <FlatButton
                        styleClass={mergeClasses(
                            classes.button,
                            classes.modeBtn
                        )}
                        title={intl.get("organize.openMode")}
                        ariaLabel={intl.get("organize.openMode")}
                        onClick={() => setMenuOpen(v => !v)}>
                        <span className={classes.label}>{currentLabel}</span>
                        <Icon
                            iconName="ChevronDown"
                            className={classes.caret}
                        />
                    </FlatButton>
                    {menuOpen && (
                        <ContextualMenu
                            target={modeBtnRef.current}
                            directionalHint={DirectionalHint.bottomRightEdge}
                            onDismiss={() => setMenuOpen(false)}
                            items={options.map(opt => ({
                                key: String(opt.key),
                                text: opt.text,
                                canCheck: true,
                                isChecked: opt.key === currentTarget,
                                onClick: () => {
                                    setMenuOpen(false)
                                    void dispatch(
                                        saveReadingPreferences({
                                            collections: {
                                                ...collections,
                                                [key]: {
                                                    ...collections[key],
                                                    openTarget:
                                                        opt.key === "inherit"
                                                            ? undefined
                                                            : Number(opt.key),
                                                },
                                            },
                                        })
                                    )
                                },
                            }))}
                        />
                    )}
                </div>
            )}
        </span>
    )
}
