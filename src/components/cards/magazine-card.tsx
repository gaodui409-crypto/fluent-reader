import * as React from "react"
import { useEffect, useState } from "react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import { TranslatedTitle } from "../personal/ai"
import { SourceTextDirection } from "../../scripts/models/source"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectArticle } from "../../scripts/models/organize"

const className = (props: Card.Props) => {
    let cn = ["card", "magazine-card"]
    if (props.item.hasRead) cn.push("read")
    if (props.item.hidden) cn.push("hidden")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const MagazineCard: React.FunctionComponent<Card.Props> = props => {
    const dispatch = useAppDispatch()
    const batchSelected = useAppSelector(s =>
        s.organize.selected.includes(props.item._id)
    )
    const [thumbBroken, setThumbBroken] = useState(false)

    useEffect(() => {
        setThumbBroken(false)
    }, [props.item.thumb])

    const events = Card.bindEventsToProps(props)

    return (
        <div
            className={className(props)}
            {...events}
            style={{
                ...events.style,
                ...(batchSelected
                    ? {
                          outline: "2px solid var(--primary)",
                          outlineOffset: "-2px",
                      }
                    : undefined),
            }}
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
            {props.item.thumb && !thumbBroken ? (
                <div className="head">
                    <img
                        src={props.item.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ borderRadius: "4px" }}
                        onError={() => setThumbBroken(true)}
                    />
                </div>
            ) : null}
            <div className="data">
                <div>
                    <h3 className="title">
                        <TranslatedTitle
                            item={props.item}
                            filter={props.filter}
                        />
                    </h3>
                    <p className="snippet">
                        <Highlights
                            text={props.item.snippet}
                            filter={props.filter}
                        />
                    </p>
                </div>
                <CardInfo source={props.source} item={props.item} showCreator />
            </div>
        </div>
    )
}

export default MagazineCard
