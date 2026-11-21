import { RefObject, useLayoutEffect } from "react"

type Position = { top: number; anchor?: string; offset?: number }
const positions = new Map<string, Position>()

// Keep the virtualized list's loaded pages in Redux and its viewport here.
export function useFeedPosition(
    ref: RefObject<HTMLElement>,
    key: string,
    loaded: boolean,
    count: number
) {
    useLayoutEffect(() => {
        const node = ref.current
        if (!node || !loaded) return
        const saved = positions.get(key)
        let restoring = true
        let frame: number
        const remember = () => {
            if (restoring) return
            const viewport = node.getBoundingClientRect()
            const top = viewport.top
            const cards = Array.from(
                node.querySelectorAll<HTMLElement>("[data-iid]")
            )
            const anchor = cards.find(card => {
                const bounds = card.getBoundingClientRect()
                return bounds.bottom > top && bounds.top < viewport.bottom
            })
            positions.set(key, {
                top: node.scrollTop,
                anchor: anchor?.dataset.iid,
                offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
            })
            if (positions.size > 100)
                positions.delete(positions.keys().next().value)
        }
        if (saved) node.scrollTop = saved.top
        frame = requestAnimationFrame(() => {
            // List finishes mounting its virtual page spacers after our layout
            // effect. Retry once they exist instead of caching the clamped zero.
            if (saved) node.scrollTop = saved.top
            frame = requestAnimationFrame(() => {
                if (saved?.anchor) {
                    const anchor = node.querySelector<HTMLElement>(
                        `[data-iid="${saved.anchor}"]`
                    )
                    if (anchor)
                        node.scrollTop +=
                            anchor.getBoundingClientRect().top -
                            node.getBoundingClientRect().top -
                            saved.offset
                }
                restoring = false
                remember()
            })
        })
        node.addEventListener("scroll", remember, { passive: true })
        return () => {
            cancelAnimationFrame(frame)
            node.removeEventListener("scroll", remember)
        }
    }, [key, loaded, count])
}
