import { safeStorage } from "electron"
import type Store from "electron-store"
import { SchemaTypes, ServiceConfigs, SyncService } from "../schema-types"

type StoredService = ServiceConfigs & { encrypted?: string }

export function protectServiceConfig(config: ServiceConfigs): StoredService {
    if (
        !config ||
        !Number.isInteger(config.type) ||
        config.type < SyncService.None ||
        config.type > SyncService.Nextcloud
    )
        throw new Error("Invalid synchronization service settings.")
    if (config.type === SyncService.None) return { type: SyncService.None }
    if (!safeStorage.isEncryptionAvailable())
        throw new Error(
            "System credential encryption is unavailable. Please sign in to your operating system and try again."
        )
    return {
        type: config.type,
        encrypted: safeStorage
            .encryptString(JSON.stringify(config))
            .toString("base64"),
    }
}

export function readServiceConfig(store: Store<SchemaTypes>): ServiceConfigs {
    const stored = store.get("serviceConfigs", {
        type: SyncService.None,
    }) as StoredService
    if (stored.type === SyncService.None) return { type: SyncService.None }
    if (stored.encrypted) {
        try {
            const plain = JSON.parse(
                safeStorage.decryptString(
                    Buffer.from(stored.encrypted, "base64")
                )
            ) as ServiceConfigs
            if (!plain || plain.type !== stored.type)
                throw new Error("Invalid credential record.")
            return plain
        } catch {
            throw new Error(
                "Saved service credentials cannot be decrypted for this operating system account. Re-enter them in Settings → Services. Existing subscriptions and articles are kept."
            )
        }
    }
    // Migrate frozen legacy values by replacing them, never mutating the cache.
    store.set("serviceConfigs", protectServiceConfig(stored))
    return { ...stored }
}
