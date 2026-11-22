import * as React from "react"
import { useEffect, useState } from "react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import { TranslatedTitle } from "../personal/ai"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"
import { forumPost } from "../../forum"
import { isLinuxDo } from "../../linuxdo"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectArticle } from "../../scripts/models/organize"
import { makeStyles, mergeClasses } from "@griffel/react"

const useStyles = makeStyles({
    batchSelected: {
        backgroundColor: "var(--neutralLighter)",
        boxShadow: "inset 3px 0 0 var(--primary)",
    },
    thumbImg: {
        borderRadius: "4px",
    },
    forum: {
        "& .data": { margin: "9px 12px", minWidth: 0 },
        "& .info": { marginBottom: "5px", gap: "3px" },
        "& h3.title": {
            fontSize: "14px",
            fontWeight: 500,
            lineHeight: "20px",
            WebkitLineClamp: 2,
        },
        "& div.head": {
            width: "48px",
            height: "48px",
            margin: "10px 0 10px 12px",
            flexShrink: 0,
            order: 1,
            marginRight: "12px",
        },
        "& div.head img": {
            width: "48px",
            height: "48px",
            borderRadius: "5px",
        },
        "& p.snippet": { WebkitLineClamp: 1 },
        "& .info > span[title]": {
            maxWidth: "100px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "11px",
        },
    },
})

const className = (props: Card.Props) => {
    let cn = ["card", "list-card"]
    if (props.item.hidden) cn.push("hidden")
    if (props.selected) cn.push("selected")
    if (props.viewConfigs & ViewConfigs.FadeRead && props.item.hasRead)
        cn.push("read")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const ListCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const batchSelected = useAppSelector(s =>
        s.organize.selected.includes(props.item._id)
    )
    const single = useAppSelector(
        s => s.app.menuKey === "s-" + props.source.sid
    )
    const [thumbBroken, setThumbBroken] = useState(false)

    useEffect(() => {
        setThumbBroken(false)
    }, [props.item.thumb])

    const forum = isLinuxDo(props.item.link)
    const post = forum ? forumPost(props.item.link) : null
    const events = Card.bindEventsToProps(props)

    return (
        <div
            className={mergeClasses(
                className(props),
                forum && classes.forum,
                batchSelected && classes.batchSelected
            )}
            {...events}
            onClick={event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    event.preventDefault()
                    event.stopPropagation()
                    dispatch(selectArticle(props.item._id, event.shiftKey))
                } else {
                    events.onClick(event)
                }
            }}
            onKeyDown={event => {
                if (event.target !== event.currentTarget) return
                if (event.key === " ") {
                    event.preventDefault()
                    event.stopPropagation()
                    dispatch(selectArticle(props.item._id, event.shiftKey))
                } else {
                    events.onKeyDown(event)
                }
            }}
            data-iid={props.item._id}
            data-selected={batchSelected}
            data-is-focusable>
            {props.item.thumb &&
            !thumbBroken &&
            props.viewConfigs & ViewConfigs.ShowCover ? (
                <div className="head">
                    <img
                        className={classes.thumbImg}
                        src={props.item.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => setThumbBroken(true)}
                    />
                </div>
            ) : null}
            <div className="data">
                <CardInfo
                    source={props.source}
                    item={props.item}
                    hideSource={single && forum}
                    showCreator={forum}
                    postLabel={
                        post
                            ? post.post === 1
                                ? "主题"
                                : `回复 · ${post.post}楼`
                            : undefined
                    }
                />
                <h3 className="title">
                    <TranslatedTitle item={props.item} filter={props.filter} />
                </h3>
                {Boolean(props.viewConfigs & ViewConfigs.ShowSnippet) && (
                    <p className="snippet">
                        <Highlights
                            text={props.item.snippet}
                            filter={props.filter}
                        />
                    </p>
                )}
            </div>
        </div>
    )
}

export default ListCard
