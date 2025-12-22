// Chat Enclave Service
// Provides encryption, anonymous identity, and session management for secure chat

import crypto from 'crypto';
import { roflCoreServer, ROFLServerEncryptedBlob } from './roflCoreServer';

// Types
export interface ChatSession {
    anonymousId: string;      // Random ID shown to peers (not linked to wallet)
    sessionKey: string;       // Ephemeral key for this session
    createdAt: number;
    expiresAt: number;
}

export interface EncryptedMessage {
    iv: string;               // Initialization vector
    ciphertext: string;       // Encrypted content
    authTag: string;          // Authentication tag
    sessionId: string;        // Sender's anonymous session ID
    timestamp: number;
    roflBlob?: ROFLServerEncryptedBlob; // ROFL TEE encrypted data (if used)
}

// Session storage (in-memory for now, could be Redis in production)
const activeSessions = new Map<string, ChatSession>();

// Constants
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a cryptographically secure anonymous session
 * The anonymousId is NOT linked to the wallet address
 */
export function createAnonymousSession(walletAddress: string): ChatSession {
    // Generate random anonymous ID (12 hex chars)
    const anonymousId = '0x' + crypto.randomBytes(6).toString('hex');

    // Generate ephemeral session key (32 bytes for AES-256)
    const sessionKey = crypto.randomBytes(32).toString('hex');

    const now = Date.now();
    const session: ChatSession = {
        anonymousId,
        sessionKey,
        createdAt: now,
        expiresAt: now + SESSION_DURATION_MS
    };

    // Store session (indexed by wallet for JWT verification)
    activeSessions.set(walletAddress, session);

    console.log(`[ChatEnclave] Created session for wallet ${walletAddress.slice(0, 10)}... -> Anonymous ID: ${anonymousId}`);

    return session;
}

/**
 * Get session by wallet address
 */
export function getSession(walletAddress: string): ChatSession | null {
    const session = activeSessions.get(walletAddress);

    if (!session) return null;

    // Check expiration
    if (Date.now() > session.expiresAt) {
        activeSessions.delete(walletAddress);
        return null;
    }

    return session;
}

/**
 * Encrypt a message using the session key (with ROFL TEE support)
 */
export function encryptMessage(content: string, session: ChatSession): EncryptedMessage {
    // Try ROFL TEE encryption first
    if (roflCoreServer.isAvailable()) {
        try {
            const roflBlob = roflCoreServer.encrypt(content);
            return {
                iv: '',
                ciphertext: '',
                authTag: '',
                sessionId: session.anonymousId,
                timestamp: Date.now(),
                roflBlob,
            };
        } catch (error) {
            console.warn('[ChatEnclave] ROFL encryption failed, falling back:', error);
        }
    }

    // Fallback: Local crypto
    const key = Buffer.from(session.sessionKey, 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(content, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        ciphertext,
        authTag,
        sessionId: session.anonymousId,
        timestamp: Date.now()
    };
}

/**
 * Decrypt a message using the session key (with ROFL TEE support)
 */
export function decryptMessage(encrypted: EncryptedMessage, session: ChatSession): string | null {
    try {
        // Try ROFL TEE decryption first
        if (encrypted.roflBlob && roflCoreServer.isAvailable()) {
            try {
                return roflCoreServer.decrypt(encrypted.roflBlob);
            } catch (error) {
                console.warn('[ChatEnclave] ROFL decryption failed:', error);
            }
        }

        // Fallback: Local crypto
        const key = Buffer.from(session.sessionKey, 'hex');
        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
        plaintext += decipher.final('utf8');

        return plaintext;
    } catch (error) {
        console.error('[ChatEnclave] Decryption failed:', error);
        return null;
    }
}

/**
 * Generate a JWT for chat authentication
 * Uses HMAC-SHA256 with ENCLAVE_SECRET
 */
export function generateChatToken(walletAddress: string, session: ChatSession): string {
    const secret = process.env.ENCLAVE_SECRET || 'default-chat-secret';

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        wallet: walletAddress,
        anonId: session.anonymousId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(session.expiresAt / 1000)
    })).toString('base64url');

    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

    return `${header}.${payload}.${signature}`;
}

/**
 * Verify a chat JWT and return the session info
 */
export function verifyChatToken(token: string): { wallet: string; anonId: string } | null {
    try {
        const secret = process.env.ENCLAVE_SECRET || 'default-chat-secret';
        const [header, payload, signature] = token.split('.');

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${header}.${payload}`)
            .digest('base64url');

        if (signature !== expectedSignature) {
            console.error('[ChatEnclave] Invalid JWT signature');
            return null;
        }

        // Decode payload
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

        // Check expiration
        if (decoded.exp < Math.floor(Date.now() / 1000)) {
            console.error('[ChatEnclave] JWT expired');
            return null;
        }

        return {
            wallet: decoded.wallet,
            anonId: decoded.anonId
        };
    } catch (error) {
        console.error('[ChatEnclave] JWT verification failed:', error);
        return null;
    }
}

/**
 * Destroy a session (logout)
 */
export function destroySession(walletAddress: string): void {
    activeSessions.delete(walletAddress);
    console.log(`[ChatEnclave] Destroyed session for ${walletAddress.slice(0, 10)}...`);
}

/**
 * Get count of active sessions
 */
export function getActiveSessionCount(): number {
    // Clean up expired sessions first
    const now = Date.now();
    for (const [wallet, session] of activeSessions.entries()) {
        if (now > session.expiresAt) {
            activeSessions.delete(wallet);
        }
    }
    return activeSessions.size;
}

export const chatEnclave = {
    createAnonymousSession,
    getSession,
    encryptMessage,
    decryptMessage,
    generateChatToken,
    verifyChatToken,
    destroySession,
    getActiveSessionCount
};
