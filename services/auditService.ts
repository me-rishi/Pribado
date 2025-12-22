import db from './db';
import crypto from 'crypto';
import { serverEnclave } from './serverEnclave';
import { roflCoreServer } from './roflCoreServer';

export interface AuditLogEntry {
    event: string;
    user: string;
    source: string;
    ip: string;
    time: string; // ISO string
    details?: any;
    teeHash?: string;
}

export interface SystemStats {
    apiUsageCount: number;
    secretCount: number;
}

class AuditService {
    constructor() {
        // No loadData needed, DB is persistent
    }

    // Encrypt details for secure storage
    private encryptDetails(details: any): string {
        const secret = process.env.ENCLAVE_SECRET || 'default-audit-secret';
        const key = crypto.createHash('sha256').update(secret).digest().slice(0, 32);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        const plaintext = JSON.stringify(details);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        return JSON.stringify({
            ciphertext: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag,
            algorithm: 'TEE_AES_GCM_AUDIT',
            timestamp: Date.now()
        });
    }

    // Decrypt details for viewing (used in getLogs)
    private decryptDetails(encryptedDetails: string): any {
        try {
            // Check if it's encrypted format
            const parsed = JSON.parse(encryptedDetails);
            if (parsed.ciphertext && parsed.iv && parsed.authTag) {
                const secret = process.env.ENCLAVE_SECRET || 'default-audit-secret';
                const key = crypto.createHash('sha256').update(secret).digest().slice(0, 32);
                const iv = Buffer.from(parsed.iv, 'hex');
                const authTag = Buffer.from(parsed.authTag, 'hex');
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);

                let decrypted = decipher.update(parsed.ciphertext, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return JSON.parse(decrypted);
            }
            // Legacy unencrypted format
            return parsed;
        } catch {
            // Return as-is if decryption fails
            try {
                return JSON.parse(encryptedDetails);
            } catch {
                return { raw: encryptedDetails };
            }
        }
    }

    public log(event: string, user: string, source: string, ip: string, details?: any) {
        const now = Date.now();
        const isoTime = new Date(now).toISOString();

        const entryDetails = {
            ip,
            source,
            ...details
        };

        const entryJson = JSON.stringify({
            event,
            user,
            time: isoTime,
            details: entryDetails
        });

        // 1. Generate Hash (ROFL or SHA256)
        let phash = '';
        let hash = '';

        // Get previous hash for chaining
        try {
            const lastLog = db.prepare('SELECT hash FROM audit_logs ORDER BY timestamp DESC LIMIT 1').get() as { hash: string };
            if (lastLog) phash = lastLog.hash;
        } catch { }

        if (roflCoreServer.isAvailable()) {
            try {
                // ROFL signs the content + previous hash
                hash = roflCoreServer.hashAndAttest(entryJson + phash);
            } catch (error) {
                console.warn('[AuditService] ROFL attestation failed:', error);
                hash = crypto.createHash('sha256').update(entryJson + phash).digest('hex');
            }
        } else {
            hash = crypto.createHash('sha256').update(entryJson + phash).digest('hex');
        }

        const id = crypto.randomUUID();

        // 2. Encrypt details and insert into DB
        const encryptedDetailsStr = this.encryptDetails(entryDetails);

        try {
            db.prepare(`
                INSERT INTO audit_logs (id, timestamp, actor, action, target, details, hash, previous_hash, signature)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id,
                now,
                user, // actor
                event, // action
                source, // target
                encryptedDetailsStr, // Now encrypted!
                hash,
                phash,
                'ropc_mock_sig' // Placeholder if not using real sig
            );
        } catch (e) {
            console.error('[AuditService] Failed to insert log:', e);
        }
    }

    public incrementApiUsage() {
        // We calculate this dynamically now or store in kv_store?
        // Let's store a counter in kv_store for speed
        try {
            const row = db.prepare("SELECT value FROM kv_store WHERE key = 'stat_api_usage'").get() as { value: string };
            const count = row ? parseInt(row.value) + 1 : 1;
            db.prepare("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)").run('stat_api_usage', count.toString(), Date.now());
        } catch (e) {
            console.error('[AuditService] Failed to increment usage:', e);
        }
    }

    public getLogs(limit: number = 50): AuditLogEntry[] {
        try {
            const rows = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
            return rows.map(row => {
                const details = this.decryptDetails(row.details || '{}');
                return {
                    event: row.action,
                    user: row.actor,
                    source: row.target || details.source,
                    ip: details.ip || 'unknown',
                    time: new Date(row.timestamp).toISOString(),
                    details: details,
                    teeHash: row.hash
                };
            });
        } catch (e) {
            console.error('[AuditService] Failed to get logs:', e);
            return [];
        }
    }

    public getStats(): SystemStats {
        try {
            const usageRow = db.prepare("SELECT value FROM kv_store WHERE key = 'stat_api_usage'").get() as { value: string };
            const apiUsageCount = usageRow ? parseInt(usageRow.value) : 0;

            const secretCount = serverEnclave.getKeyCount();

            return {
                apiUsageCount,
                secretCount
            };
        } catch {
            return { apiUsageCount: 0, secretCount: 0 };
        }
    }

    public updateSecretCount(count: number) {
        // No-op, we fetch live from Enclave/DB now
    }

    // Get API usage filtered by user
    public getApiUsageCount(user: string): number {
        try {
            // Count logs where action='Private API Call' and actor matches
            const res = db.prepare(`
                SELECT COUNT(*) as count FROM audit_logs 
                WHERE action = 'Private API Call' 
                AND actor = ?
            `).get(user) as { count: number };
            return res.count;
        } catch {
            return 0;
        }
    }
}

export const auditService = new AuditService();
