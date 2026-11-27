import { useState, useEffect } from "react"
import { getWindowBreakpoint } from "../../../scripts/utils"

export const useIsWideScreen = () => {
    const [isWide, setIsWide] = useState(getWindowBreakpoint)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const mql =
            typeof window.matchMedia === "function"
                ? window.matchMedia("(min-width: 1280px)")
                : null
        const onMediaChange = (e: MediaQueryListEvent) => {
            clearTimeout(timer)
            setIsWide(e.matches)
        }
        const handler = () => {
            clearTimeout(timer)
            timer = setTimeout(() => {
                setIsWide(getWindowBreakpoint())
            }, 100)
        }
        mql?.addEventListener?.("change", onMediaChange)
        window.addEventListener("resize", handler)
        return () => {
            clearTimeout(timer)
            mql?.removeEventListener?.("change", onMediaChange)
            window.removeEventListener("resize", handler)
        }
    }, [])

    return isWide
}
