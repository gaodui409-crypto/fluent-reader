import { useEffect, useState } from "react"
import { useAppSelector } from "../../scripts/reducer"

export function useMenuCollections() {
    const items = useAppSelector(state => state.items)
    const sources = useAppSelector(s => s.sources)
    const savedCount = useAppSelector(s => s.library.saved.length)
    const [counts, setCounts] = useState({
        later: 0,
        starred: 0,
        unfiled: 0,
    })
    const [revision, setRevision] = useState(0)

    useEffect(() => {
        return window.personal.onChanged(() => setRevision(n => n + 1))
    }, [])

    useEffect(() => {
        let active = true
        const timer = setTimeout(() => {
            window.db
                .execute(
                    "SELECT coalesce(sum(i.readLater),0), coalesce(sum(i.starred),0), (SELECT count(*) FROM items u WHERE u.kept=1 AND NOT EXISTS(SELECT 1 FROM folder_articles fa WHERE fa.itemId=u._id)) FROM items i",
                    [],
                    "get"
                )
                .then(row => {
                    if (active && row)
                        setCounts({
                            later: Number(row[0]) || 0,
                            starred: Number(row[1]) || 0,
                            unfiled: Number(row[2]) || 0,
                        })
                })
                .catch(console.error)
        }, 120)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [items, sources, revision])

    return { counts: { ...counts, saved: savedCount } }
}
