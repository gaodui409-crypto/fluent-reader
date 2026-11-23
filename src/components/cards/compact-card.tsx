import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { Card } from "./card"
import CardInfo from "./info"
import Time from "../utils/time"
import Highlights from "./highlights"
import { TranslatedTitle } from "../personal/ai"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectArticle } from "../../scripts/models/organize"

const useStyles = makeStyles({
    batchSelected: {
        backgroundColor: "var(--neutralLighter)",
    },
})

const className = (props: Card.Props) => {
    let cn = ["card", "compact-card"]
    if (props.item.hidden) cn.push("hidden")
    if (props.viewConfigs & ViewConfigs.FadeRead && props.item.hasRead)
        cn.push("read")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const CompactCard: React.FunctionComponent<Card.Props> = props => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const batchSelected = useAppSelector(s =>
        s.organize.selected.includes(props.item._id)
    )
    const events = Card.bindEventsToProps(props)
    const choose = (event: React.MouseEvent | React.KeyboardEvent) => {
        event.preventDefault()
        event.stopPropagation()
        dispatch(selectArticle(props.item._id, event.shiftKey))
    }

    const shadows: string[] = []
    if (props.item.highlight)
        shadows.push(`inset 4px 0 ${props.item.highlight}`)
    if (batchSelected) shadows.push("inset 0 0 0 2px var(--primary)")

    return (
        <div
            className={mergeClasses(
                className(props),
                batchSelected && classes.batchSelected
            )}
            {...events}
            style={
                shadows.length ? { boxShadow: shadows.join(", ") } : undefined
            }
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
                else events.onKeyDown(event)
            }}
            data-iid={props.item._id}
            data-selected={batchSelected}
            data-is-focusable>
            <CardInfo source={props.source} item={props.item} hideTime />
            <div className="data">
                <span className="title">
                    <TranslatedTitle item={props.item} filter={props.filter} />
                </span>
                <span className="snippet">
                    <Highlights
                        text={props.item.snippet}
                        filter={props.filter}
                    />
                </span>
            </div>
            <Time date={props.item.date} />
        </div>
    )
}

export default CompactCard
