// Server-Side Notification Service with SQLite Persistence
// Scalable to 100k+ notifications with zero file-locking issues

import db from './db';
import crypto from 'crypto';

export interface Notification {
    id: string;
    type: 'key_rotated' | 'key_provisioned' | 'key_revoked' | 'info';
    title: string;
    message: string;
    createdAt: number;
    read: boolean;
    metadata?: Record<string, string>;
}

// Generate unique ID
const generateId = (): string => {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

// Encrypt metadata for secure storage
const encryptMetadata = (metadata: Record<string, string>): string => {
    const secret = process.env.ENCLAVE_SECRET || 'default-notif-secret';
    const key = crypto.createHash('sha256').update(secret).digest().slice(0, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintext = JSON.stringify(metadata);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return JSON.stringify({
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag,
        algorithm: 'TEE_AES_GCM_NOTIF'
    });
};

// Decrypt metadata for viewing
const decryptMetadata = (encryptedMeta: string): Record<string, string> | undefined => {
    try {
        const parsed = JSON.parse(encryptedMeta);
        if (parsed.ciphertext && parsed.iv && parsed.authTag) {
            const secret = process.env.ENCLAVE_SECRET || 'default-notif-secret';
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
        try {
            return JSON.parse(encryptedMeta);
        } catch {
            return undefined;
        }
    }
};

class NotificationService {
    static add(type: Notification['type'], title: string, message: string, metadata?: Record<string, string>) {
        const notification: Notification = {
            id: generateId(),
            type,
            title,
            message,
            createdAt: Date.now(),
            read: false,
            metadata
        };

        try {
            db.prepare(`
                INSERT INTO notifications (id, type, title, message, meta, timestamp, read)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            `).run(
                notification.id,
                type,
                title,
                message,
                metadata ? encryptMetadata(metadata) : null,
                notification.createdAt
            );
            console.log(`[Notification] Added: ${title}`);
        } catch (e) {
            console.error('[NotificationService] Failed to add notification:', e);
        }

        return notification;
    }

    static getAll(): Notification[] {
        try {
            const rows = db.prepare('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 50').all() as any[];
            return rows.map(row => ({
                id: row.id,
                type: row.type,
                title: row.title,
                message: row.message,
                createdAt: row.timestamp,
                read: row.read === 1,
                metadata: row.meta ? decryptMetadata(row.meta) : undefined
            }));
        } catch {
            return [];
        }
    }

    static getUnread(): Notification[] {
        try {
            const rows = db.prepare('SELECT * FROM notifications WHERE read = 0 ORDER BY timestamp DESC').all() as any[];
            return rows.map(row => ({
                id: row.id,
                type: row.type,
                title: row.title,
                message: row.message,
                createdAt: row.timestamp,
                read: false,
                metadata: row.meta ? decryptMetadata(row.meta) : undefined
            }));
        } catch {
            return [];
        }
    }

    static getUnreadCount(): number {
        try {
            const res = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number };
            return res.count;
        } catch {
            return 0;
        }
    }

    static markAsRead(id: string) {
        try {
            db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
        } catch (e) {
            console.error('[NotificationService] Failed to mark as read:', e);
        }
    }

    static markAllAsRead() {
        try {
            db.prepare('UPDATE notifications SET read = 1').run();
        } catch (e) {
            console.error('[NotificationService] Failed to mark all as read:', e);
        }
    }

    static clear() {
        try {
            db.prepare('DELETE FROM notifications').run();
        } catch (e) {
            console.error('[NotificationService] Failed to clear notifications:', e);
        }
    }
}

export const notificationService = NotificationService;
