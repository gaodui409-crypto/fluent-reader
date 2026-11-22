import { BrowserWindow, nativeTheme, app, screen } from "electron"
import * as path from "node:path"
import { setThemeListener } from "./settings"
import { setUtilsListeners } from "./utils"

export class WindowManager {
    mainWindow: BrowserWindow = null

    constructor() {
        this.init()
    }

    private init = () => {
        app.on("ready", () => {
            this.setListeners()
            this.createWindow()
        })
    }

    private setListeners = () => {
        setThemeListener(this)
        setUtilsListeners(this)

        app.on("second-instance", () => {
            if (this.hasWindow()) {
                if (this.mainWindow.isMinimized()) this.mainWindow.restore()
                this.mainWindow.show()
                this.mainWindow.focus()
            }
        })

        app.on("activate", () => {
            if (!this.hasWindow()) {
                this.createWindow()
            }
        })
    }

    private sendToRenderer = (channel: string, ...args: unknown[]) => {
        if (this.hasWindow() && !this.mainWindow.webContents.isDestroyed()) {
            this.mainWindow.webContents.send(channel, ...args)
        }
    }

    createWindow = () => {
        if (!this.hasWindow()) {
            const workArea = screen.getPrimaryDisplay().workAreaSize
            const minWidth = Math.min(992, workArea.width)
            const minHeight = Math.min(600, workArea.height)
            const defaultWidth = Math.min(
                workArea.width,
                Math.max(minWidth, Math.min(1360, workArea.width - 40))
            )
            const defaultHeight = Math.min(
                workArea.height,
                Math.max(minHeight, Math.min(840, workArea.height - 40))
            )
            this.mainWindow = new BrowserWindow({
                name: "main",
                windowStatePersistence: true,
                title: "Fluent Reader",
                icon: path.join(__dirname, "icons", "app.png"),
                backgroundColor:
                    process.platform === "darwin"
                        ? "#00000000"
                        : nativeTheme.shouldUseDarkColors
                        ? "#282828"
                        : "#faf9f8",
                vibrancy: "sidebar",
                width: defaultWidth,
                height: defaultHeight,
                minWidth,
                minHeight,
                frame: process.platform === "darwin",
                titleBarStyle: "hiddenInset",
                fullscreenable: process.platform === "darwin",
                show: false,
                webPreferences: {
                    webviewTag: true,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                    spellcheck: false,
                    preload: path.join(__dirname, "preload.js"),
                },
            })
            if (process.platform === "win32" && app.isPackaged) {
                const personal = [
                    "fluent-reader-personal",
                    "Fluent Reader Personal",
                ].includes(app.getName())
                // Explorer's relaunch icon is separate from WM_SETICON. Point it
                // at the executable, not an image inside ASAR that Explorer cannot read.
                const quotePath = (value: string) =>
                    '"' + value.replace(/(\\+)$/, "$1$1") + '"'
                this.mainWindow.setAppDetails({
                    appId: personal
                        ? "local.fluentreader.personal"
                        : "me.hyliu.fluentreader",
                    appIconPath: process.execPath,
                    appIconIndex: 0,
                    relaunchCommand:
                        quotePath(process.execPath) +
                        " --user-data-dir=" +
                        quotePath(app.getPath("userData")),
                    relaunchDisplayName: app.getName(),
                })
            }
            this.mainWindow.webContents.on(
                "will-attach-webview",
                (_, preferences, params) => {
                    preferences.nodeIntegration = false
                    preferences.contextIsolation = true
                    preferences.sandbox = true
                    delete preferences.preload
                    if (/^https?:/i.test(params.src))
                        preferences.partition = "persist:sandbox"
                }
            )
            this.mainWindow.on("ready-to-show", () => {
                if (!this.hasWindow()) return
                this.mainWindow.show()
                this.mainWindow.focus()
                if (!app.isPackaged) this.mainWindow.webContents.openDevTools()
            })
            this.mainWindow.loadFile(path.join(__dirname, "index.html"))

            this.mainWindow.on("maximize", () => {
                this.sendToRenderer("maximized")
            })
            this.mainWindow.on("unmaximize", () => {
                this.sendToRenderer("unmaximized")
            })
            this.mainWindow.on("enter-full-screen", () => {
                this.sendToRenderer("enter-fullscreen")
            })
            this.mainWindow.on("leave-full-screen", () => {
                this.sendToRenderer("leave-fullscreen")
            })
            this.mainWindow.on("focus", () => {
                this.sendToRenderer("window-focus")
            })
            this.mainWindow.on("blur", () => {
                this.sendToRenderer("window-blur")
            })
            this.mainWindow.webContents.on("context-menu", (_, params) => {
                if (params.selectionText) {
                    this.sendToRenderer(
                        "window-context-menu",
                        [params.x, params.y],
                        params.selectionText
                    )
                }
            })
        }
    }

    zoom = () => {
        if (this.hasWindow()) {
            if (this.mainWindow.isMaximized()) {
                this.mainWindow.unmaximize()
            } else {
                this.mainWindow.maximize()
            }
        }
    }

    hasWindow = () => {
        return this.mainWindow !== null && !this.mainWindow.isDestroyed()
    }
}
