import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database setup
const DB_PATH = path.join(process.cwd(), 'data', 'pribado.sqlite');
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize Schema
const initSchema = () => {
    // =====================================================
    // SECRETS TABLE (API Keys, Vault secrets)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS secrets (
            id TEXT PRIMARY KEY,
            id_hash TEXT UNIQUE,
            owner TEXT NOT NULL,
            provider TEXT NOT NULL,
            encrypted_data TEXT NOT NULL, 
            iv TEXT,
            auth_tag TEXT,
            created_at INTEGER NOT NULL,
            last_rotated INTEGER NOT NULL,
            rotation_interval INTEGER DEFAULT 0,
            webhook_url TEXT,
            origin_key TEXT,
            origin_key_hash TEXT,
            history TEXT,
            rofl_encrypted TEXT
        )
    `);

    // =====================================================
    // DOCUMENTS TABLE (Replaces sapphire_ledger.json emails)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            email TEXT,
            encrypted_data TEXT NOT NULL,
            document_hash TEXT,
            tx_hash TEXT,
            signature TEXT,
            network TEXT DEFAULT 'mainnet',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // =====================================================
    // RATE LIMITS TABLE (Replaces rate_limits.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
            ip_hash TEXT PRIMARY KEY,
            calls TEXT NOT NULL,
            last_call INTEGER NOT NULL
        )
    `);

    // =====================================================
    // BANNED IPS TABLE (Replaces banned_ips.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS banned_ips (
            ip_hash TEXT PRIMARY KEY,
            reason TEXT NOT NULL,
            banned_at INTEGER NOT NULL,
            expires_at INTEGER
        )
    `);

    // =====================================================
    // SERVICE TOKENS TABLE (Replaces service_tokens.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS service_tokens (
            id TEXT PRIMARY KEY,
            token_hash TEXT UNIQUE NOT NULL,
            token_prefix TEXT NOT NULL,
            customer_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER,
            revoked INTEGER DEFAULT 0
        )
    `);

    // =====================================================
    // USAGE TRACKING TABLE (Replaces usage_tracking.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS usage_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id TEXT NOT NULL,
            customer_id TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            cost_usd REAL NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (token_id) REFERENCES service_tokens(id)
        )
    `);

    // =====================================================
    // PAYMENTS TABLE (Replaces x402_payments.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
            payment_id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            token_id TEXT,
            tx_hash TEXT,
            created_at INTEGER NOT NULL
        )
    `);

    // =====================================================
    // STATS TABLE (Replaces stats.json)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS stats (
            key TEXT PRIMARY KEY,
            value INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // =====================================================
    // AUDIT LOGS TABLE
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT NOT NULL,
            details TEXT,
            hash TEXT NOT NULL,
            previous_hash TEXT NOT NULL,
            signature TEXT
        )
    `);

    // =====================================================
    // NOTIFICATIONS TABLE
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            meta TEXT,
            timestamp INTEGER NOT NULL,
            read INTEGER DEFAULT 0
        )
    `);

    // =====================================================
    // KEY-VALUE STORE (Generic)
    // =====================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // =====================================================
    // CREATE INDEXES
    // =====================================================
    db.exec(`CREATE INDEX IF NOT EXISTS idx_secrets_id_hash ON secrets(id_hash)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_secrets_owner ON secrets(owner)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_tx_hash ON documents(tx_hash)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_service_tokens_customer ON service_tokens(customer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_service_tokens_hash ON service_tokens(token_hash)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_tracking_token ON usage_tracking(token_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_tracking_customer ON usage_tracking(customer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)`);

    // Migration: Add columns if they don't exist
    const migrations = [
        `ALTER TABLE secrets ADD COLUMN id_hash TEXT UNIQUE`,
        `ALTER TABLE secrets ADD COLUMN origin_key_hash TEXT`,
    ];

    for (const migration of migrations) {
        try { db.exec(migration); } catch { /* Column exists */ }
    }

    console.log('[Database] Schema initialized with all tables');
};

initSchema();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Rate Limits
export const getRateLimit = (ipHash: string) => {
    const stmt = db.prepare('SELECT * FROM rate_limits WHERE ip_hash = ?');
    return stmt.get(ipHash) as { ip_hash: string; calls: string; last_call: number } | undefined;
};

export const setRateLimit = (ipHash: string, calls: number[], lastCall: number) => {
    const stmt = db.prepare(`
        INSERT INTO rate_limits (ip_hash, calls, last_call) VALUES (?, ?, ?)
        ON CONFLICT(ip_hash) DO UPDATE SET calls = excluded.calls, last_call = excluded.last_call
    `);
    stmt.run(ipHash, JSON.stringify(calls), lastCall);
};

export const cleanupRateLimits = (olderThan: number) => {
    const stmt = db.prepare('DELETE FROM rate_limits WHERE last_call < ?');
    return stmt.run(olderThan);
};

// Banned IPs
export const getBannedIP = (ipHash: string) => {
    const stmt = db.prepare('SELECT * FROM banned_ips WHERE ip_hash = ?');
    return stmt.get(ipHash) as { ip_hash: string; reason: string; banned_at: number; expires_at: number | null } | undefined;
};

export const banIP = (ipHash: string, reason: string, expiresAt: number | null) => {
    const stmt = db.prepare(`
        INSERT INTO banned_ips (ip_hash, reason, banned_at, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(ip_hash) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at, expires_at = excluded.expires_at
    `);
    stmt.run(ipHash, reason, Date.now(), expiresAt);
};

export const unbanIP = (ipHash: string) => {
    const stmt = db.prepare('DELETE FROM banned_ips WHERE ip_hash = ?');
    return stmt.run(ipHash);
};

export const getAllBannedIPs = () => {
    const stmt = db.prepare('SELECT * FROM banned_ips');
    return stmt.all() as { ip_hash: string; reason: string; banned_at: number; expires_at: number | null }[];
};

export const cleanupExpiredBans = () => {
    const stmt = db.prepare('DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at < ?');
    return stmt.run(Date.now());
};

// Service Tokens
export const getServiceToken = (tokenHash: string) => {
    const stmt = db.prepare('SELECT * FROM service_tokens WHERE token_hash = ? AND revoked = 0');
    return stmt.get(tokenHash);
};

export const createServiceToken = (id: string, tokenHash: string, tokenPrefix: string, customerId: string, name: string, expiresAt: number | null) => {
    const stmt = db.prepare(`
        INSERT INTO service_tokens (id, token_hash, token_prefix, customer_id, name, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, tokenHash, tokenPrefix, customerId, name, Date.now(), expiresAt);
};

export const getCustomerTokens = (customerId: string) => {
    const stmt = db.prepare('SELECT * FROM service_tokens WHERE customer_id = ? AND revoked = 0');
    return stmt.all(customerId);
};

export const revokeServiceToken = (id: string) => {
    const stmt = db.prepare('UPDATE service_tokens SET revoked = 1 WHERE id = ?');
    return stmt.run(id);
};

// Usage Tracking
export const recordUsage = (tokenId: string, customerId: string, endpoint: string, costUsd: number) => {
    const stmt = db.prepare(`
        INSERT INTO usage_tracking (token_id, customer_id, endpoint, cost_usd, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(tokenId, customerId, endpoint, costUsd, Date.now());
};

export const getUsageSummary = (customerId: string) => {
    const stmt = db.prepare(`
        SELECT 
            COUNT(*) as total_calls,
            SUM(cost_usd) as total_cost,
            MAX(timestamp) as last_call
        FROM usage_tracking WHERE customer_id = ?
    `);
    return stmt.get(customerId) as { total_calls: number; total_cost: number; last_call: number };
};

export const getUsageByToken = (tokenId: string) => {
    const stmt = db.prepare(`
        SELECT 
            endpoint,
            COUNT(*) as calls,
            SUM(cost_usd) as cost
        FROM usage_tracking WHERE token_id = ? GROUP BY endpoint
    `);
    return stmt.all(tokenId);
};

// Documents
export const getDocument = (id: string) => {
    const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
    return stmt.get(id);
};

export const getDocumentsByOwner = (owner: string) => {
    const stmt = db.prepare('SELECT * FROM documents WHERE owner = ? ORDER BY created_at DESC');
    return stmt.all(owner);
};

// Encrypt document data with TEE-style encryption
const encryptDocumentData = (data: string): string => {
    const crypto = require('crypto');
    const secret = process.env.ENCLAVE_SECRET || 'default-doc-secret';
    const key = crypto.createHash('sha256').update(secret).digest().slice(0, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return JSON.stringify({
        ciphertext: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag,
        algorithm: 'TEE_AES_GCM_DOC',
        timestamp: Date.now()
    });
};

// Decrypt document data
export const decryptDocumentData = (encryptedData: string): string | null => {
    try {
        const crypto = require('crypto');
        const parsed = JSON.parse(encryptedData);

        // Check if already encrypted format
        if (!parsed.ciphertext || !parsed.iv || !parsed.authTag) {
            // Legacy plaintext - return as-is
            return encryptedData;
        }

        const secret = process.env.ENCLAVE_SECRET || 'default-doc-secret';
        const key = crypto.createHash('sha256').update(secret).digest().slice(0, 32);
        const iv = Buffer.from(parsed.iv, 'hex');
        const authTag = Buffer.from(parsed.authTag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(parsed.ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[DB] Failed to decrypt document data:', e);
        return null;
    }
};

export const createDocument = (doc: {
    id: string;
    owner: string;
    email?: string;
    encrypted_data: string;
    document_hash?: string;
    tx_hash?: string;
    signature?: string;
    network?: string;
}) => {
    // Encrypt the document data before storing
    const encryptedPayload = encryptDocumentData(doc.encrypted_data);

    const stmt = db.prepare(`
        INSERT INTO documents (id, owner, email, encrypted_data, document_hash, tx_hash, signature, network, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    stmt.run(doc.id, doc.owner, doc.email, encryptedPayload, doc.document_hash, doc.tx_hash, doc.signature, doc.network || 'mainnet', now, now);
};

export const updateDocumentTxHash = (id: string, txHash: string) => {
    const stmt = db.prepare('UPDATE documents SET tx_hash = ?, updated_at = ? WHERE id = ?');
    return stmt.run(txHash, Date.now(), id);
};

// Payments
export const createPayment = (payment: {
    payment_id: string;
    customer_id: string;
    amount: number;
    currency: string;
    status: string;
    token_id?: string;
    tx_hash?: string;
}) => {
    const stmt = db.prepare(`
        INSERT INTO payments (payment_id, customer_id, amount, currency, status, token_id, tx_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(payment.payment_id, payment.customer_id, payment.amount, payment.currency, payment.status, payment.token_id, payment.tx_hash, Date.now());
};

export const getPayment = (paymentId: string) => {
    const stmt = db.prepare('SELECT * FROM payments WHERE payment_id = ?');
    return stmt.get(paymentId);
};

export const updatePaymentStatus = (paymentId: string, status: string) => {
    const stmt = db.prepare('UPDATE payments SET status = ? WHERE payment_id = ?');
    return stmt.run(status, paymentId);
};

// Stats
export const getStat = (key: string) => {
    const stmt = db.prepare('SELECT value FROM stats WHERE key = ?');
    const result = stmt.get(key) as { value: number } | undefined;
    return result?.value ?? 0;
};

export const incrementStat = (key: string, amount = 1) => {
    const stmt = db.prepare(`
        INSERT INTO stats (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, amount, Date.now());
};

export const setStat = (key: string, value: number) => {
    const stmt = db.prepare(`
        INSERT INTO stats (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, value, Date.now());
};

export const getAllStats = () => {
    const stmt = db.prepare('SELECT key, value FROM stats');
    return stmt.all() as { key: string; value: number }[];
};

// KV Store
export const kvGet = (key: string) => {
    const stmt = db.prepare('SELECT value FROM kv_store WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value;
};

export const kvSet = (key: string, value: string) => {
    const stmt = db.prepare(`
        INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, value, Date.now());
};

export const kvDelete = (key: string) => {
    const stmt = db.prepare('DELETE FROM kv_store WHERE key = ?');
    return stmt.run(key);
};

export default db;

