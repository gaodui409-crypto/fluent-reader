import { ipcRenderer } from "electron"
import { getPageData } from "single-file-core/single-file.js"

// This preload stays in Electron's isolated world. No capability is exposed to
// the remote page; only the main process can ask it to capture the loaded DOM.
ipcRenderer.on("offline:capture", async () => {
    try {
        const wait = (ms: number) =>
            new Promise(resolve => setTimeout(resolve, ms))
        document.querySelectorAll("img").forEach(img => {
            img.loading = "eager"
        })
        for (let step = 0; step < 30; step++) {
            window.scrollTo(0, step * innerHeight)
            await wait(120)
            if (
                (step + 1) * innerHeight >=
                document.documentElement.scrollHeight
            )
                break
        }
        window.scrollTo(0, 0)
        await wait(500)
        const text = document.body?.innerText || ""
        const result = await getPageData(
            {
                removeScripts: true,
                blockScripts: true,
                removeFrames: false,
                removeHiddenElements: false,
                removeUnusedStyles: false,
                removeUnusedFonts: false,
                compressHTML: false,
                compressCSS: false,
                loadDeferredContent: false,
                insertMetaCSP: true,
                insertSingleFileComment: true,
                blockAudios: true,
                blockVideos: true,
                saveFavicon: true,
                maxResourceSizeEnabled: true,
                maxResourceSize: 20,
                networkTimeout: 20000,
                url: location.href,
            },
            {
                fetch: async (url: string) => {
                    if (
                        String(url).startsWith("data:") ||
                        String(url).startsWith("blob:")
                    )
                        return fetch(url)
                    const result = await ipcRenderer.invoke(
                        "offline:resource",
                        url
                    )
                    if (result.error) throw new Error(result.error)
                    return new Response(new Uint8Array(result.bytes), {
                        status: result.status,
                        headers: result.headers,
                    })
                },
            }
        )
        ipcRenderer.send("offline:captured", { html: result.content, text })
    } catch (error) {
        ipcRenderer.send("offline:captured", { error: String(error) })
    }
})
