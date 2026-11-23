import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react"
import { Card } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import { TranslatedTitle } from "../personal/ai"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectArticle } from "../../scripts/models/organize"

const className = (props: Card.Props) => {
    let cn = ["card", "magazine-card"]
    const configs =
        props.viewConfigs ??
        ViewConfigs.ShowCover | ViewConfigs.ShowSnippet | ViewConfigs.FadeRead
    if (configs & ViewConfigs.FadeRead && props.item.hasRead) cn.push("read")
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

    const configs =
        props.viewConfigs ??
        ViewConfigs.ShowCover | ViewConfigs.ShowSnippet | ViewConfigs.FadeRead
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
            {props.item.thumb &&
            !thumbBroken &&
            Boolean(configs & ViewConfigs.ShowCover) ? (
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
                    {Boolean(configs & ViewConfigs.ShowSnippet) && (
                        <p className="snippet">
                            <Highlights
                                text={props.item.snippet}
                                filter={props.filter}
                            />
                        </p>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <CardInfo
                            source={props.source}
                            item={props.item}
                            showCreator
                        />
                    </div>
                    <button
                        type="button"
                        title={intl.get("organize.selectHint")}
                        aria-label={intl.get(
                            batchSelected
                                ? "organize.deselect"
                                : "organize.select"
                        )}
                        style={{
                            border: "none",
                            background: "transparent",
                            color: batchSelected
                                ? "var(--primary)"
                                : "var(--neutralSecondary)",
                            cursor: "pointer",
                            padding: "2px 4px",
                        }}
                        onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            dispatch(selectArticle(props.item._id, e.shiftKey))
                        }}
                        onMouseUp={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}>
                        <Icon
                            iconName={
                                batchSelected ? "CheckboxComposite" : "Checkbox"
                            }
                            style={{ fontSize: 13 }}
                        />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default MagazineCard
