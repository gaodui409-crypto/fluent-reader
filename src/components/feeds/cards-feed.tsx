import * as React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { FeedProps } from "./feed"
import DefaultCard from "../cards/default-card"
import { RSSItem } from "../../scripts/models/item"
import { FocusZone, List, AnimationClassNames } from "@fluentui/react"
import { useFeedTabStop } from "../utils/hooks/useFeedTabStop"
import { FeedEnd } from "./feed-end"
import { useFeedPosition } from "../utils/hooks/useFeedPosition"

const CardsFeed: React.FC<FeedProps> = props => {
    const { elementRef, onPagesUpdated } = useFeedTabStop()
    useFeedPosition(
        elementRef,
        props.feed._id + ":cards:" + JSON.stringify(props.filter),
        props.feed.loaded,
        props.items.length
    )
    const [width, setWidth] = useState(window.innerWidth)
    const [height, setHeight] = useState(window.innerHeight)
    const observerRef = useRef<ResizeObserver>(null)

    useEffect(() => {
        const main = document.querySelector(".main")
        if (!main) return
        setWidth(main.clientWidth - 40)
        observerRef.current = new ResizeObserver(
            (entries: ResizeObserverEntry[]) => {
                if (entries.length) {
                    setWidth(entries[0].contentRect.width - 40)
                    setHeight(window.innerHeight)
                }
            }
        )
        observerRef.current.observe(main)
        return () => {
            observerRef.current?.disconnect()
        }
    }, [])

    const getItemCountForPage = useCallback(() => {
        const elemPerRow = Math.max(1, Math.floor(width / 280))
        const rows = Math.ceil(height / 340)
        return elemPerRow * rows
    }, [width, height])

    const getPageHeight = useCallback(() => {
        return height + (340 - (height % 340))
    }, [height])

    const flexFixItems = () => {
        if (props.items.length === 0) return []
        const elemPerRow = Math.max(1, Math.floor(width / 280))
        const elemLastRow = props.items.length % elemPerRow
        if (elemLastRow === 0) return props.items
        const items: (RSSItem | null)[] = [...props.items]
        for (let i = 0; i < elemPerRow - elemLastRow; i += 1) items.push(null)
        return items
    }

    const onRenderItem = (item: RSSItem, index: number) =>
        item ? (
            <DefaultCard
                feedId={props.feed._id}
                key={item._id}
                item={item}
                source={props.sourceMap[item.source]}
                filter={props.filter}
                viewConfigs={props.viewConfigs}
                shortcuts={props.shortcuts}
                markRead={props.markRead}
                contextMenu={props.contextMenu}
                showItem={props.showItem}
            />
        ) : (
            <div className="flex-fix" key={"f-" + index}></div>
        )

    return (
        props.feed.loaded && (
            <FocusZone
                elementRef={elementRef}
                as="div"
                id="refocus"
                className="cards-feed-container"
                data-is-scrollable>
                {props.items.length > 0 && (
                    <List
                        className={AnimationClassNames.slideUpIn10}
                        items={flexFixItems()}
                        onRenderCell={onRenderItem}
                        onPagesUpdated={onPagesUpdated}
                        getItemCountForPage={getItemCountForPage}
                        getPageHeight={getPageHeight}
                        ignoreScrollingState
                        usePageCache
                    />
                )}
                <FeedEnd {...props} />
            </FocusZone>
        )
    )
}

export default CardsFeed
