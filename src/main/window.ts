import { BrowserWindow, nativeTheme, app } from "electron"
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
            if (this.mainWindow !== null) {
                this.mainWindow.focus()
            }
        })

        app.on("activate", () => {
            if (this.mainWindow === null) {
                this.createWindow()
            }
        })
    }

    createWindow = () => {
        if (!this.hasWindow()) {
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
                width: 1200,
                height: 700,
                minWidth: 992,
                minHeight: 600,
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
                    preload: path.join(
                        app.getAppPath(),
                        (app.isPackaged ? "dist/" : "") + "preload.js"
                    ),
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
                this.mainWindow.show()
                this.mainWindow.focus()
                if (!app.isPackaged) this.mainWindow.webContents.openDevTools()
            })
            this.mainWindow.loadFile(
                (app.isPackaged ? "dist/" : "") + "index.html"
            )

            this.mainWindow.on("maximize", () => {
                this.mainWindow.webContents.send("maximized")
            })
            this.mainWindow.on("unmaximize", () => {
                this.mainWindow.webContents.send("unmaximized")
            })
            this.mainWindow.on("enter-full-screen", () => {
                this.mainWindow.webContents.send("enter-fullscreen")
            })
            this.mainWindow.on("leave-full-screen", () => {
                this.mainWindow.webContents.send("leave-fullscreen")
            })
            this.mainWindow.on("focus", () => {
                this.mainWindow.webContents.send("window-focus")
            })
            this.mainWindow.on("blur", () => {
                this.mainWindow.webContents.send("window-blur")
            })
            this.mainWindow.webContents.on("context-menu", (_, params) => {
                if (params.selectionText) {
                    this.mainWindow.webContents.send(
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
