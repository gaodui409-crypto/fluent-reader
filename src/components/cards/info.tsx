import * as React from "react"
import Time from "../utils/time"
import { RSSSource } from "../../scripts/models/source"
import { RSSItem } from "../../scripts/models/item"
import { useAppSelector } from "../../scripts/reducer"
import intl from "react-intl-universal"

type CardInfoProps = {
    source: RSSSource
    item: RSSItem
    hideTime?: boolean
    showCreator?: boolean
    hideSource?: boolean
    postLabel?: string
}

const CardInfo: React.FunctionComponent<CardInfoProps> = props => {
    const saved = useAppSelector(state =>
        state.library.saved.includes(props.item._id)
    )
    return (
        <p className="info">
            {!props.hideSource && props.source.iconurl ? (
                <img src={props.source.iconurl} />
            ) : null}
            <span className="name">
                {props.hideSource
                    ? props.item.creator
                        ? "@" + props.item.creator
                        : "LINUX DO"
                    : props.source.name}
                {props.postLabel && <span> · {props.postLabel}</span>}
                {!props.hideSource &&
                    props.showCreator &&
                    props.item.creator && (
                        <span className="creator">{props.item.creator}</span>
                    )}
            </span>
            {props.item.starred ? (
                <span className="starred-indicator"></span>
            ) : null}
            {!!props.item.tags?.length && (
                <span title={props.item.tags.join(", ")}>
                    #{props.item.tags.join(" #")}
                </span>
            )}
            {saved && (
                <span title={intl.get("personal.savedOffline")}> ▣ </span>
            )}
            {props.item.readLater && (
                <span title={intl.get("personal.readLater")}> ◷ </span>
            )}
            {props.item.hasRead ? null : (
                <span className="read-indicator"></span>
            )}
            {props.hideTime ? null : (
                <Time
                    date={props.item.date}
                    title={intl.get("refresh.articleTimes", {
                        published: props.item.date.toLocaleString(),
                        received: props.item.fetchedDate.toLocaleString(),
                    })}
                />
            )}
        </p>
    )
}

export default CardInfo
