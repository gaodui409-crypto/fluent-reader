import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import type { WindowManager } from "./window"

export type MainWindowHolder = Pick<WindowManager, "hasWindow" | "mainWindow">

export function isTrustedMainFrame(
    event: IpcMainEvent | IpcMainInvokeEvent | null | undefined,
    manager: MainWindowHolder | null | undefined
): boolean {
    if (!manager || !manager.hasWindow()) return false
    const mainContents = manager.mainWindow?.webContents
    if (!mainContents || mainContents.isDestroyed()) return false
    return Boolean(
        event?.sender === mainContents &&
            event?.senderFrame === mainContents.mainFrame
    )
}

export function assertTrustedMainFrame(
    event: IpcMainEvent | IpcMainInvokeEvent | null | undefined,
    manager: MainWindowHolder | null | undefined
): void {
    if (!isTrustedMainFrame(event, manager)) {
        throw new Error("Untrusted IPC sender.")
    }
}
