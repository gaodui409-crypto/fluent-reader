import * as React from "react"
import { Icon } from "@fluentui/react"
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

const iconBadgeStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--neutralSecondary)",
    flexShrink: 0,
}

const CardInfo: React.FunctionComponent<CardInfoProps> = props => {
    const saved = useAppSelector(state =>
        state.library.saved.includes(props.item._id)
    )
    const offlineTask = useAppSelector(
        state => state.library.offlineTasks?.[props.item._id]
    )
    const hasNote = useAppSelector(state =>
        Boolean(state.library.notedIds?.includes(props.item._id))
    )
    const inFolder = useAppSelector(state =>
        Boolean(state.library.folderedIds?.includes(props.item._id))
    )
    const offlineRunning =
        offlineTask?.state === "waiting" || offlineTask?.state === "running"

    return (
        <p className="info">
            {!props.hideSource && props.source.iconurl ? (
                <img src={props.source.iconurl} alt="" />
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
            {hasNote && !props.hideTime && (
                <Icon
                    iconName="EditNote"
                    style={iconBadgeStyle}
                    title="含文章备注"
                />
            )}
            {inFolder && !props.hideTime && (
                <Icon
                    iconName="FolderHorizontal"
                    style={iconBadgeStyle}
                    title="已归入文章文件夹"
                />
            )}
            {offlineRunning ? (
                <Icon
                    iconName="ProgressRingDots"
                    style={{ ...iconBadgeStyle, color: "var(--primary)" }}
                    title="正在保存离线网页…"
                />
            ) : (
                saved && (
                    <Icon
                        iconName="OfflineStorage"
                        style={iconBadgeStyle}
                        title={intl.get("personal.savedOffline")}
                    />
                )
            )}
            {props.item.readLater && (
                <Icon
                    iconName="Clock"
                    style={iconBadgeStyle}
                    title={intl.get("personal.readLater")}
                />
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
