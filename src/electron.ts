import { app, Menu, nativeTheme, session } from "electron"
import { ThemeSettings } from "./schema-types"
import { bindSettingsManager, initSettingsStore, store } from "./main/settings"
import performUpdate from "./main/update-scripts"
import { WindowManager } from "./main/window"
import { initDB } from "./main/db"

const hasSingleInstanceLock = process.mas
    ? true
    : app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
    app.exit(0)
} else {
    initSettingsStore()

    if (!app.isPackaged) app.setAppUserModelId(process.execPath)
    else if (process.platform === "win32")
        app.setAppUserModelId(
            app.getName() === "fluent-reader-personal" ||
                app.getName() === "Fluent Reader Personal"
                ? "local.fluentreader.personal"
                : "me.hyliu.fluentreader"
        )

    let restarting = false

    function init() {
        performUpdate(store)
        nativeTheme.themeSource = store.get("theme", ThemeSettings.Default)
    }

    init()

    const winManager = new WindowManager()
    bindSettingsManager(winManager)

    if (process.platform === "darwin") {
        const template = [
            {
                label: "Application",
                submenu: [
                    {
                        label: "Hide",
                        accelerator: "Command+H",
                        click: () => {
                            app.hide()
                        },
                    },
                    {
                        label: "Quit",
                        accelerator: "Command+Q",
                        click: () => {
                            if (winManager.hasWindow())
                                winManager.mainWindow.close()
                        },
                    },
                ],
            },
            {
                label: "Edit",
                submenu: [
                    {
                        label: "Undo",
                        accelerator: "CmdOrCtrl+Z",
                        selector: "undo:",
                    },
                    {
                        label: "Redo",
                        accelerator: "Shift+CmdOrCtrl+Z",
                        selector: "redo:",
                    },
                    {
                        label: "Cut",
                        accelerator: "CmdOrCtrl+X",
                        selector: "cut:",
                    },
                    {
                        label: "Copy",
                        accelerator: "CmdOrCtrl+C",
                        selector: "copy:",
                    },
                    {
                        label: "Paste",
                        accelerator: "CmdOrCtrl+V",
                        selector: "paste:",
                    },
                    {
                        label: "Select All",
                        accelerator: "CmdOrCtrl+A",
                        selector: "selectAll:",
                    },
                ],
            },
            {
                label: "Window",
                submenu: [
                    {
                        label: "Close",
                        accelerator: "Command+W",
                        click: () => {
                            if (winManager.hasWindow())
                                winManager.mainWindow.close()
                        },
                    },
                    {
                        label: "Minimize",
                        accelerator: "Command+M",
                        click: () => {
                            if (winManager.hasWindow())
                                winManager.mainWindow.minimize()
                        },
                    },
                    { label: "Zoom", click: () => winManager.zoom() },
                ],
            },
        ]
        Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    } else {
        Menu.setApplicationMenu(null)
    }

    initDB(store, winManager, () => {
        if (restarting) return
        restarting = true
        if (winManager.hasWindow()) {
            const closingMain = winManager.mainWindow
            closingMain.once("closed", () => {
                if (restarting) {
                    restarting = false
                    winManager.mainWindow = null
                    winManager.createWindow()
                }
            })
            closingMain.close()
        } else {
            restarting = false
            winManager.createWindow()
        }
    })

    app.on("window-all-closed", () => {
        winManager.mainWindow = null
        if (restarting) {
            restarting = false
            winManager.createWindow()
        } else {
            void session.defaultSession
                .clearStorageData({
                    storages: ["cookies", "localstorage"],
                })
                .catch(() => {})
                .finally(() => {
                    app.quit()
                })
        }
    })
}
