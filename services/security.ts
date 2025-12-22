import crypto from 'crypto';
import {
    getRateLimit,
    setRateLimit,
    cleanupRateLimits,
    getBannedIP,
    banIP as dbBanIP,
    unbanIP as dbUnbanIP,
    getAllBannedIPs,
    cleanupExpiredBans
} from './db';

// Hash IP for privacy
export function hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip + (process.env.ENCLAVE_SECRET || '')).digest('hex').slice(0, 16);
}

// Check if IP is banned
export function isIPBanned(ip: string): { banned: boolean; reason?: string; expiresAt?: number | null } {
    const hashedIP = hashIP(ip);

    // Cleanup expired bans
    cleanupExpiredBans();

    const banRecord = getBannedIP(hashedIP);

    if (!banRecord) {
        return { banned: false };
    }

    // Check if ban has expired
    if (banRecord.expires_at && Date.now() > banRecord.expires_at) {
        dbUnbanIP(hashedIP);
        return { banned: false };
    }

    return {
        banned: true,
        reason: banRecord.reason,
        expiresAt: banRecord.expires_at
    };
}

// Ban an IP
export function banIP(ip: string, reason: 'spam' | 'abuse' | 'permanent', durationHours?: number): void {
    const hashedIP = hashIP(ip);
    const expiresAt = durationHours ? Date.now() + (durationHours * 60 * 60 * 1000) : null;

    dbBanIP(hashedIP, reason, expiresAt);
    console.log(`[Security] IP ${hashedIP} banned for ${reason} (${durationHours ? durationHours + 'h' : 'permanent'})`);
}

// Unban an IP
export function unbanIP(hashedIP: string): boolean {
    const result = dbUnbanIP(hashedIP);
    return result.changes > 0;
}

// Rate limit check result
export interface RateLimitResult {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
    callsInWindow?: number;
}

/**
 * Check rate limit for an IP
 * 
 * Rules:
 * - 10 calls in 5 seconds = 24 hour ban (spam)
 * - 1000 calls in 1 minute = permanent ban (abuse)
 * - Normal limit: 60 calls per minute
 */
export function checkRateLimit(ip: string, endpoint?: string): RateLimitResult {
    const now = Date.now();
    const hashedIP = hashIP(ip);

    // First check if banned
    const banCheck = isIPBanned(ip);
    if (banCheck.banned) {
        return {
            allowed: false,
            reason: `IP banned: ${banCheck.reason}`,
            retryAfter: banCheck.expiresAt ? Math.ceil((banCheck.expiresAt - now) / 1000) : undefined
        };
    }

    // Get rate limit from DB
    const rateLimitRecord = getRateLimit(hashedIP);
    let calls: number[] = rateLimitRecord ? JSON.parse(rateLimitRecord.calls) : [];

    // Add current call
    calls.push(now);

    // Clean up old calls (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    calls = calls.filter(t => t > oneMinuteAgo);

    // Check for spam (10 calls in 5 seconds)
    const fiveSecondsAgo = now - 5000;
    const callsInFiveSeconds = calls.filter(t => t > fiveSecondsAgo).length;

    if (callsInFiveSeconds > 10) {
        banIP(ip, 'spam', 24);  // 24 hour ban
        setRateLimit(hashedIP, calls, now);
        return {
            allowed: false,
            reason: 'Rate limit exceeded: Spam detected. IP banned for 24 hours.',
            retryAfter: 24 * 60 * 60
        };
    }

    // Check for abuse (1000 calls in 1 minute)
    const callsInMinute = calls.length;

    if (callsInMinute > 1000) {
        banIP(ip, 'permanent');  // Permanent ban
        setRateLimit(hashedIP, calls, now);
        return {
            allowed: false,
            reason: 'Rate limit exceeded: Abuse detected. IP permanently banned.'
        };
    }

    // Normal rate limit (60 calls per minute for free tier)
    if (callsInMinute > 60) {
        setRateLimit(hashedIP, calls, now);
        return {
            allowed: false,
            reason: 'Rate limit exceeded: 60 calls per minute',
            retryAfter: 60 - Math.floor((now - calls[0]) / 1000),
            callsInWindow: callsInMinute
        };
    }

    // Periodically clean up old rate limits
    if (Math.random() < 0.01) {
        cleanupRateLimits(now - 300000);  // Remove entries older than 5 minutes
    }

    // Save rate limit
    setRateLimit(hashedIP, calls, now);

    return {
        allowed: true,
        callsInWindow: callsInMinute
    };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
    const headers = [
        'cf-connecting-ip',
        'x-real-ip',
        'x-forwarded-for',
        'x-client-ip',
        'true-client-ip',
    ];

    for (const header of headers) {
        const value = request.headers.get(header);
        if (value) {
            const ip = value.split(',')[0].trim();
            if (ip && ip !== 'unknown') {
                return ip;
            }
        }
    }

    return '127.0.0.1';
}

/**
 * Security middleware result
 */
export interface SecurityCheckResult {
    allowed: boolean;
    error?: {
        status: number;
        message: string;
        retryAfter?: number;
    };
    requestId?: string;
}

/**
 * Full security check for API endpoints
 */
export function securityCheck(request: Request): SecurityCheckResult {
    const ip = getClientIP(request);
    const requestId = crypto.randomUUID().slice(0, 8);

    const rateLimitResult = checkRateLimit(ip);

    if (!rateLimitResult.allowed) {
        console.log(`[Security] Request ${requestId} blocked from ${hashIP(ip)}: ${rateLimitResult.reason}`);
        return {
            allowed: false,
            error: {
                status: 429,
                message: rateLimitResult.reason || 'Rate limit exceeded',
                retryAfter: rateLimitResult.retryAfter
            },
            requestId
        };
    }

    return {
        allowed: true,
        requestId
    };
}

/**
 * Get list of banned IPs (for admin)
 */
export function getBannedIPs() {
    return getAllBannedIPs();
}

/**
 * Security headers to add to responses
 */
export const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
};
