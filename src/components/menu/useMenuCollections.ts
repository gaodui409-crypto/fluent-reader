import { useEffect, useState } from "react"
import { useAppSelector } from "../../scripts/reducer"

export function useMenuCollections() {
    const items = useAppSelector(state => state.items)
    const sources = useAppSelector(s => s.sources)
    const feeds = useAppSelector(s => s.feeds)
    const hiddenLater = !!(feeds["later:"]?.filter.type & 4)
    const hiddenStarred = !!(feeds["starred:"]?.filter.type & 4)
    const [tags, setTags] = useState<string[]>([])
    const [counts, setCounts] = useState({ later: 0, starred: 0 })
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        return window.personal.onChanged(() => setRevision(n => n + 1))
    }, [])

    useEffect(() => {
        let active = true
        const timer = setTimeout(() => {
            window.db
                .execute(
                    "SELECT coalesce(sum(i.readLater),0),coalesce(sum(i.starred),0) FROM items i",
                    [],
                    "get"
                )
                .then(row => {
                    if (active && row)
                        setCounts({
                            later: Number(row[0]) || 0,
                            starred: Number(row[1]) || 0,
                        })
                })
                .catch(console.error)
            window.personal
                .tags()
                .then(values => {
                    if (active) setTags(values)
                })
                .catch(console.error)
        }, 120)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [items, sources, hiddenLater, hiddenStarred, revision])

    return { tags, counts }
}
