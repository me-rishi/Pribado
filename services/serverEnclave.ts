// Server-Side Enclave with Wallet-Based Double-Layer Encryption
// Now using SQLite for scalable storage while keeping keys encrypted in TEE

import crypto from 'crypto';
import db from './db';
import { notificationService } from './notificationService';
import { auditService } from './auditService';
import { roflCoreServer, ROFLServerEncryptedBlob } from './roflCoreServer';

interface EnclaveEntry {
    id: string; // pribadoKey
    realKey: string; // Stored encrypted with ENCLAVE_SECRET or ROFL
    provider: string;
    owner: string;
    createdAt: number;
    rotationInterval: number;
    lastRotated: number;
    webhookUrl?: string;
    history: string[]; // Previous pribadoKeys
    originKey: string;
    roflEncrypted?: ROFLServerEncryptedBlob;
}

// Export EncryptedFile for external usage (Audit Logs) - Kept for compatibility
export interface EncryptedFile {
    owner: string;
    blob: string;
    encryptedSessionKey?: string;
    version: number;
}

// Rotation intervals in milliseconds (Shared const)
export const ROTATION_INTERVALS = {
    none: 0,
    '1min': 60000,
    '5min': 300000,
    '15min': 900000,
    '30min': 1800000,
    '1h': 3600000,
    '12h': 43200000,
    '24h': 86400000,
    '7d': 604800000,
    '30d': 2592000000,
};

const GRACE_PERIOD = 0;

// Session storage for wallet-derived key (memory only)
let sessionKey: string | null = null;
let sessionOwner: string | null = null;

// Get or generate server secret (second layer)
const getEnclaveSecret = (): string => {
    if (process.env.ENCLAVE_SECRET) {
        return process.env.ENCLAVE_SECRET;
    }
    // console.warn('[Enclave] No ENCLAVE_SECRET set. Using generated fallback.');
    return crypto.createHash('sha256').update('pribado-default-enclave-' + (process.env.HOSTNAME || 'local')).digest('hex').substring(0, 32);
};

// Encrypt with session key (wallet-derived) - Used for Audit Log blobs
const encryptWithSession = (text: string): string => {
    if (!sessionKey) throw new Error('Enclave not unlocked');
    const key = Buffer.from(sessionKey.padEnd(32, '0').substring(0, 32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
};

// Decrypt with session key (wallet-derived)
const decryptWithSession = (encryptedText: string): string => {
    if (!sessionKey) throw new Error('Enclave not unlocked');
    try {
        const key = Buffer.from(sessionKey.padEnd(32, '0').substring(0, 32));
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[Enclave] Decryption failed:', e);
        return '';
    }
};

// Encrypt individual real key with server secret (Layer 2)
const encryptRealKey = (text: string): string => {
    const secret = getEnclaveSecret();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0').substring(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

// Decrypt individual real key with server secret
const decryptRealKey = (encryptedText: string): string => {
    try {
        const secret = getEnclaveSecret();
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0').substring(0, 32)), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return '';
    }
};

// Generate new pribado key
const generatePribadoKey = (): string => {
    const hash = crypto.randomBytes(16).toString('hex');
    return `priv_${hash}`;
};

// Hash pribado key for O(1) lookups (stored in id_hash column)
const hashPribadoKey = (key: string): string => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

// Mask pribado key for audit logs (show first 8 + last 4 chars)
const maskPribadoKey = (key: string): string => {
    if (!key || key.length < 16) return 'priv_***';
    return key.substring(0, 12) + '...' + key.slice(-4);
};

// Send webhook notification
const notifyWebhook = async (webhookUrl: string, payload: object) => {
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log(`[Enclave] Webhook notified: ${webhookUrl}`);
    } catch (e) {
        console.error('[Enclave] Webhook notification failed:', e);
    }
};

class ServerEnclave {
    // Restore session key from DB if it exists (auto-unlock)
    static initialize() {
        try {
            const row = db.prepare("SELECT value FROM kv_store WHERE key = 'enclave_session_key'").get() as { value: string } | undefined;
            if (row && row.value) {
                const recoveredKey = decryptRealKey(row.value);
                if (recoveredKey) {
                    sessionKey = recoveredKey;
                    // Try to get owner if stored, otherwise default system
                    const ownerRow = db.prepare("SELECT value FROM kv_store WHERE key = 'enclave_owner'").get() as { value: string } | undefined;
                    sessionOwner = ownerRow?.value || 'system';
                    console.log('[Enclave] Auto-unlocked from DB state');
                }
            }
        } catch (e) {
            console.error('[Enclave] Init failed:', e);
        }
    }

    static setSessionKey(key: string, owner: string) {
        sessionKey = key;
        sessionOwner = owner;
        console.log(`[Enclave] Session key set for owner: ${owner}`);

        // Persist encrypted session key to DB for auto-recovery
        const encryptedSessionKey = encryptRealKey(key);
        db.prepare("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)").run('enclave_session_key', encryptedSessionKey, Date.now());
        db.prepare("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)").run('enclave_owner', owner, Date.now());
    }

    static isUnlocked(): boolean {
        return !!sessionKey;
    }

    static getOwner(): string | null {
        return sessionOwner;
    }

    static provision(
        pribadoKey: string,
        realKey: string,
        provider: string,
        rotationInterval: number = 0,
        webhookUrl?: string
    ) {
        if (!pribadoKey.startsWith('priv_')) {
            throw new Error('Invalid Pribado Key format');
        }
        if (!sessionKey || !sessionOwner) {
            throw new Error('Enclave not unlocked');
        }

        // Use ROFL TEE encryption if available
        let encryptedKey: string;
        let roflBlob: ROFLServerEncryptedBlob | undefined;
        let roflEncryptedJson: string | null = null;

        if (roflCoreServer.isAvailable()) {
            roflBlob = roflCoreServer.encryptAPIKey(realKey);
            encryptedKey = JSON.stringify(roflBlob);
            roflEncryptedJson = encryptedKey;
            console.log(`[Enclave] Using ROFL TEE encryption for ${maskPribadoKey(pribadoKey)}`);
        } else {
            encryptedKey = encryptRealKey(realKey); // Fallback to legacy
        }

        const now = Date.now();

        // Encrypt the pribado key itself and create hash for lookups
        const encryptedPribadoKey = encryptRealKey(pribadoKey);
        const pribadoKeyHash = hashPribadoKey(pribadoKey);

        db.prepare(`
            INSERT INTO secrets (
                id, id_hash, owner, provider, encrypted_data, created_at, last_rotated, 
                rotation_interval, webhook_url, origin_key, origin_key_hash, history, rofl_encrypted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            encryptedPribadoKey,
            pribadoKeyHash,
            sessionOwner,
            provider,
            encryptedKey,
            now,
            now,
            rotationInterval,
            webhookUrl || null,
            encryptedPribadoKey,
            pribadoKeyHash,
            '[]',
            roflEncryptedJson
        );

        console.log(`[Enclave] Provisioned ${maskPribadoKey(pribadoKey)} (${provider}) for ${sessionOwner}`);

        // Audit Log (masked keyId for security)
        auditService.log(
            'Key Provisioned',
            sessionOwner,
            'Web Dashboard',
            'Internal',
            { provider, keyId: maskPribadoKey(pribadoKey) }
        );
    }

    static getRealKey(pribadoKey: string): string | null {
        if (!sessionKey) return null;

        // Fetch from DB using hash-based lookup
        const pribadoKeyHash = hashPribadoKey(pribadoKey);
        const entry = db.prepare('SELECT * FROM secrets WHERE id_hash = ?').get(pribadoKeyHash) as any;

        if (entry) {
            // Check ROFL first
            if (entry.rofl_encrypted && roflCoreServer.isAvailable()) {
                try {
                    const roflBlob = JSON.parse(entry.rofl_encrypted);
                    console.log(`[Enclave] Using ROFL TEE decryption for ${maskPribadoKey(pribadoKey)}`);
                    return roflCoreServer.decryptAPIKey(roflBlob);
                } catch (error) {
                    console.error('[Enclave] ROFL decryption failed, trying legacy:', error);
                }
            }

            // Fallback: Check if encrypted_data is ROFL JSON
            if (roflCoreServer.isROFLEncrypted(entry.encrypted_data)) {
                try {
                    const roflBlob = JSON.parse(entry.encrypted_data);
                    return roflCoreServer.decryptAPIKey(roflBlob);
                } catch {
                    // ignore
                }
            }

            // Legacy decryption
            return decryptRealKey(entry.encrypted_data);
        }

        // Check History (Grace Period) - search by hash
        const graceEntry = db.prepare("SELECT * FROM secrets WHERE history LIKE ?").get(`%${pribadoKeyHash}%`) as any;
        if (graceEntry) {
            const history = JSON.parse(graceEntry.history || '[]');
            if (history.includes(pribadoKeyHash)) {
                // Check time
                const rotatedAt = graceEntry.last_rotated;
                if (Date.now() - rotatedAt < GRACE_PERIOD) {
                    console.log(`[Enclave] Using grace period for old key hash: ${pribadoKeyHash.substring(0, 8)}...`);
                    return decryptRealKey(graceEntry.encrypted_data);
                }
            }
        }

        return null;
    }

    static checkAndRotate(pribadoKey: string): string | null {
        if (!sessionKey) return null;

        const pribadoKeyHash = hashPribadoKey(pribadoKey);
        const entry = db.prepare('SELECT * FROM secrets WHERE id_hash = ?').get(pribadoKeyHash) as any;

        if (!entry || !entry.rotation_interval || entry.rotation_interval === 0) {
            return null;
        }

        const lastRotated = entry.last_rotated;
        const timeSinceRotation = Date.now() - lastRotated;

        if (timeSinceRotation < entry.rotation_interval) {
            return null;
        }

        // Time to rotate!
        const newKey = generatePribadoKey();
        const newKeyHash = hashPribadoKey(newKey);
        const encryptedNewKey = encryptRealKey(newKey);
        const oldHistory = JSON.parse(entry.history || '[]');
        // Store hashes in history for lookup
        const newHistory = [pribadoKeyHash, ...oldHistory].slice(0, 3);
        const newHistoryJson = JSON.stringify(newHistory);
        const now = Date.now();

        // Transaction to delete old and insert new (Atomic Move)
        const move = db.transaction(() => {
            db.prepare('DELETE FROM secrets WHERE id_hash = ?').run(pribadoKeyHash);
            db.prepare(`
                INSERT INTO secrets (
                    id, id_hash, owner, provider, encrypted_data, created_at, last_rotated, 
                    rotation_interval, webhook_url, origin_key, origin_key_hash, history, rofl_encrypted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                encryptedNewKey,
                newKeyHash,
                entry.owner,
                entry.provider,
                entry.encrypted_data,
                entry.created_at,
                now,
                entry.rotation_interval,
                entry.webhook_url,
                entry.origin_key,
                entry.origin_key_hash,
                newHistoryJson,
                entry.rofl_encrypted
            );
        });
        move();

        console.log(`[Enclave] Rotated key: ${maskPribadoKey(pribadoKey)} -> ${maskPribadoKey(newKey)}`);

        if (entry.webhook_url) {
            notifyWebhook(entry.webhook_url, {
                event: 'key_rotated',
                provider: entry.provider,
                oldKey: pribadoKey,
                newKey: newKey,
                rotatedAt: now,
                nextRotation: now + entry.rotation_interval
            });
        }

        notificationService.add(
            'key_rotated',
            `${entry.provider} Key Rotated`,
            `Your ${entry.provider} API key has been automatically rotated for security. Open your dashboard to view your latest key.`,
            { provider: entry.provider, rotatedAt: new Date(now).toISOString() }
        );

        return newKey;
    }

    static getRotationInfo(pribadoKey: string): { expiresIn: number; interval: number } | null {
        if (!sessionKey) return null;
        const pribadoKeyHash = hashPribadoKey(pribadoKey);
        const entry = db.prepare('SELECT last_rotated, rotation_interval FROM secrets WHERE id_hash = ?').get(pribadoKeyHash) as any;

        if (!entry || !entry.rotation_interval) return null;

        const expiresAt = entry.last_rotated + entry.rotation_interval;
        return {
            expiresIn: expiresAt - Date.now(),
            interval: entry.rotation_interval
        };
    }

    static remove(pribadoKey: string) {
        if (!sessionKey) return;

        const pribadoKeyHash = hashPribadoKey(pribadoKey);
        const result = db.prepare('DELETE FROM secrets WHERE id_hash = ?').run(pribadoKeyHash);

        if (result.changes > 0) {
            if (sessionKey && sessionOwner) {
                auditService.log(
                    'Key Revoked',
                    sessionOwner,
                    'Web Dashboard',
                    'Internal',
                    { keyId: maskPribadoKey(pribadoKey) }
                );
            }
        }
    }

    static getKeyCount(owner?: string): number {
        if (!sessionKey) return 0;
        try {
            if (owner) {
                const res = db.prepare('SELECT COUNT(*) as count FROM secrets WHERE owner = ?').get(owner) as { count: number };
                return res.count;
            } else {
                const res = db.prepare('SELECT COUNT(*) as count FROM secrets').get() as { count: number };
                return res.count;
            }
        } catch {
            return 0;
        }
    }

    static has(pribadoKey: string): boolean {
        if (!sessionKey) return false;
        const pribadoKeyHash = hashPribadoKey(pribadoKey);
        const res = db.prepare('SELECT 1 FROM secrets WHERE id_hash = ?').get(pribadoKeyHash);
        return !!res;
    }

    // Active Rotation: Rotate all expired keys
    static rotateExpiredKeys(): { rotated: number; keys: string[] } {
        // Find candidates - select encrypted id to decrypt for rotation
        const now = Date.now();
        const candidates = db.prepare(`
            SELECT id, id_hash FROM secrets 
            WHERE rotation_interval > 0 
            AND (last_rotated + rotation_interval) < ?
        `).all(now) as { id: string; id_hash: string }[];

        let rotatedCount = 0;
        const rotatedKeys: string[] = [];

        for (const { id: encryptedId } of candidates) {
            try {
                const decryptedId = decryptRealKey(encryptedId);
                if (!decryptedId) continue;
                const newKey = this.checkAndRotate(decryptedId);
                if (newKey) {
                    rotatedCount++;
                    rotatedKeys.push(decryptedId);
                }
            } catch (e) {
                console.error(`[Enclave] Auto-rotation failed for ${encryptedId.substring(0, 20)}...:`, e);
            }
        }

        return { rotated: rotatedCount, keys: rotatedKeys };
    }

    // Find active key even if searching by an old rotated key
    static findCurrentKey(searchKey: string): string | null {
        if (!sessionKey) return null;

        // Direct match using hash
        const searchKeyHash = hashPribadoKey(searchKey);
        const direct = db.prepare('SELECT id FROM secrets WHERE id_hash = ?').get(searchKeyHash) as { id: string };
        if (direct) return decryptRealKey(direct.id);

        // Search origin or history using hash
        const derived = db.prepare(`
            SELECT id FROM secrets 
            WHERE origin_key_hash = ? 
            OR history LIKE ?
        `).get(searchKeyHash, `%${searchKeyHash}%`) as { id: string };

        return derived ? decryptRealKey(derived.id) : null;
    }

    // Public helpers for Audit Service encryption using the same Enclave context
    static encryptBlob(data: string): EncryptedFile | null {
        if (!sessionKey || !sessionOwner) return null;

        try {
            const blob = encryptWithSession(data);
            const encryptedSessionKey = encryptRealKey(sessionKey);
            return {
                owner: sessionOwner,
                blob,
                encryptedSessionKey,
                version: 2
            };
        } catch (e) {
            console.error('[Enclave] Encrypt blob failed:', e);
            return null;
        }
    }

    static decryptBlob(file: EncryptedFile): string | null {
        // Auto-unlock not needed here usually as initialize() does it
        // But for consistency:
        if (!sessionKey && file.encryptedSessionKey) {
            const recoveredKey = decryptRealKey(file.encryptedSessionKey);
            if (recoveredKey) {
                sessionKey = recoveredKey;
                sessionOwner = file.owner;
            }
        }

        if (!sessionKey) return null;

        try {
            return decryptWithSession(file.blob);
        } catch (e) {
            console.error('[Enclave] Decrypt blob failed:', e);
            return null;
        }
    }
}

// Auto-init on load
ServerEnclave.initialize();

export const serverEnclave = ServerEnclave;
