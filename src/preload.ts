import { contextBridge } from "electron"
import settingsBridge from "./bridges/settings"
import utilsBridge from "./bridges/utils"
import dbBridge from "./bridges/db"
import personalBridge from "./bridges/personal"

contextBridge.exposeInMainWorld("settings", settingsBridge)
contextBridge.exposeInMainWorld("utils", utilsBridge)
contextBridge.exposeInMainWorld("db", dbBridge)
contextBridge.exposeInMainWorld("personal", personalBridge)
