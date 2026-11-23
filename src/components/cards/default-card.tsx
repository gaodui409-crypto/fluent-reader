import * as React from "react"
import { useEffect, useState } from "react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import { TranslatedTitle } from "../personal/ai"
import { SourceTextDirection } from "../../scripts/models/source"
import { ViewConfigs } from "../../schema-types"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectArticle } from "../../scripts/models/organize"
import {
    markRead,
    markUnread,
    toggleStarred,
    updateItemMeta,
} from "../../scripts/models/item"
import { FlatButton } from "../utils/FlatButton"

const useStyles = makeStyles({
    root: {
        "height": "300px",
        "& .snippet": { maxHeight: "132px" },
        "&::after": { pointerEvents: "none" },
        "&:hover .card-footer, &:focus-within .card-footer": {
            opacity: 1,
        },
    },
    fadedRead: {
        "& h3.title": {
            color: "var(--neutralSecondary)",
            fontWeight: 500,
        },
    },
    selected: {
        "outline": "3px solid var(--primary)",
        "outlineOffset": "2px",
        "& .card-footer": { opacity: 1 },
    },
    noHover: {
        "&:hover p.snippet": { transform: "translateY(64px)" },
        "&:hover p.snippet.show": { transform: "none" },
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        backgroundColor: "var(--white)",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
        zIndex: 2,
        opacity: 0.96,
        transition: "opacity 0.14s ease",
    },
    choose: {
        width: "auto",
        flexGrow: 1,
        textAlign: "left",
        paddingLeft: "10px",
        fontSize: "12px",
    },
    action: { width: "34px", flexShrink: 0 },
    active: {
        color: "var(--primary)",
        backgroundColor: "var(--neutralLighter)",
    },
})

const className = (props: Card.Props, hover: boolean, hasThumb: boolean) => {
    let cn = ["card", "default-card"]
    if (props.item.snippet && hasThumb && hover) cn.push("transform")
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const DefaultCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const selected = useAppSelector(s =>
        s.organize.selected.includes(props.item._id)
    )
    const hover = useAppSelector(s => s.reading.hoverSummary)
    const [thumbBroken, setThumbBroken] = useState(false)

    useEffect(() => {
        setThumbBroken(false)
    }, [props.item.thumb])

    const showThumb = Boolean(props.item.thumb && !thumbBroken)
    const events = Card.bindEventsToProps(props)

    const choose = (event: React.MouseEvent | React.KeyboardEvent) => {
        event.preventDefault()
        event.stopPropagation()
        dispatch(selectArticle(props.item._id, event.shiftKey))
    }

    const act = (fn: () => Promise<void>) => {
        void fn().catch(error =>
            window.utils.showErrorBox(
                intl.get("personal.failed"),
                String(error)
            )
        )
    }

    return (
        <div
            className={mergeClasses(
                className(props, hover, showThumb),
                classes.root,
                Boolean(
                    props.viewConfigs & ViewConfigs.FadeRead &&
                        props.item.hasRead
                ) && classes.fadedRead,
                !hover && classes.noHover,
                selected && classes.selected
            )}
            {...events}
            onClick={event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    choose(event)
                } else {
                    events.onClick(event)
                }
            }}
            onKeyDown={event => {
                if (event.target !== event.currentTarget) return
                if (event.key === " ") choose(event)
                else if (event.key === "Enter")
                    events.onClick(event as unknown as React.MouseEvent)
                else events.onKeyDown(event)
            }}
            data-iid={props.item._id}
            data-selected={selected}
            data-is-focusable>
            {showThumb ? (
                <img
                    className="bg"
                    src={props.item.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setThumbBroken(true)}
                />
            ) : null}
            <div className="bg"></div>
            {showThumb ? (
                <img
                    className="head"
                    src={props.item.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setThumbBroken(true)}
                />
            ) : null}
            <CardInfo source={props.source} item={props.item} />
            <h3 className="title">
                <TranslatedTitle item={props.item} filter={props.filter} />
            </h3>
            <p className={"snippet" + (showThumb ? "" : " show")}>
                <Highlights text={props.item.snippet} filter={props.filter} />
            </p>
            <div
                className={mergeClasses("card-footer", classes.footer)}
                onClick={e => e.stopPropagation()}
                onMouseUp={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}>
                <FlatButton
                    styleClass={classes.choose}
                    title={intl.get("organize.selectHint")}
                    ariaLabel={intl.get(
                        selected ? "organize.deselect" : "organize.select"
                    )}
                    onClick={choose}>
                    <Icon
                        iconName={selected ? "CheckboxComposite" : "Checkbox"}
                    />{" "}
                    {intl.get(
                        selected ? "organize.selected" : "organize.select"
                    )}
                </FlatButton>
                <FlatButton
                    styleClass={mergeClasses(
                        classes.action,
                        props.item.starred && classes.active
                    )}
                    title={intl.get(
                        props.item.starred ? "article.unstar" : "article.star"
                    )}
                    onClick={() =>
                        act(() => dispatch(toggleStarred(props.item)))
                    }>
                    <Icon
                        iconName={
                            props.item.starred
                                ? "FavoriteStarFill"
                                : "FavoriteStar"
                        }
                    />
                </FlatButton>
                <FlatButton
                    styleClass={mergeClasses(
                        classes.action,
                        props.item.readLater && classes.active
                    )}
                    title={intl.get(
                        props.item.readLater
                            ? "organize.unlater"
                            : "personal.readLater"
                    )}
                    onClick={() =>
                        act(() =>
                            dispatch(
                                updateItemMeta(props.item, {
                                    readLater: !props.item.readLater,
                                })
                            )
                        )
                    }>
                    <Icon iconName="Clock" />
                </FlatButton>
                <FlatButton
                    styleClass={classes.action}
                    title={intl.get(
                        props.item.hasRead
                            ? "article.markUnread"
                            : "article.markRead"
                    )}
                    onClick={() =>
                        act(() =>
                            dispatch(
                                props.item.hasRead
                                    ? markUnread(props.item)
                                    : markRead(props.item, true)
                            )
                        )
                    }>
                    <Icon
                        iconName={props.item.hasRead ? "Mail" : "CheckMark"}
                    />
                </FlatButton>
                <FlatButton
                    styleClass={classes.action}
                    title={intl.get("organize.more")}
                    onClick={e =>
                        props.contextMenu(props.feedId, props.item, e)
                    }>
                    <Icon iconName="More" />
                </FlatButton>
            </div>
        </div>
    )
}

export default DefaultCard
