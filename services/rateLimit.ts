// Shared rate limit state across API routes
// Uses file persistence since Next.js API routes are stateless
import fs from 'fs';
import path from 'path';

interface RateLimitRecord {
    gasTxCount: number;
    readCount: number;
    resetTime: number;
}

interface RateLimitStore {
    [walletAddress: string]: RateLimitRecord;
}

const RATE_LIMIT_FILE = path.join(process.cwd(), 'rate_limits.json');

export const MAX_GAS_TXS_PER_HOUR = 10;
export const MAX_READS_PER_HOUR = 50;
export const RATE_LIMIT_WINDOW = 86400000; // 24 hours in ms

export const GAS_ACTIONS = ['storeEmail', 'storeVault', 'storeMailBackup'];

function loadRateLimits(): RateLimitStore {
    try {
        if (fs.existsSync(RATE_LIMIT_FILE)) {
            return JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
        }
    } catch (e) {
        // Silent fail
    }
    return {};
}

function saveRateLimits(store: RateLimitStore): void {
    try {
        fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
        // Silent fail
    }
}

export function checkRateLimit(walletAddress: string, action: string): {
    allowed: boolean;
    error?: string;
    remaining: number;
    minutesUntilReset: number;
} {
    const key = walletAddress.toLowerCase();
    const now = Date.now();
    const store = loadRateLimits();
    let record = store[key];

    // Reset if window expired or no record
    if (!record || now > record.resetTime) {
        record = { gasTxCount: 0, readCount: 0, resetTime: now + RATE_LIMIT_WINDOW };
    }

    const isGasAction = GAS_ACTIONS.includes(action);
    const msRemaining = Math.max(0, record.resetTime - now);
    const minutesUntilReset = Math.ceil(msRemaining / 60000);

    if (isGasAction) {
        if (record.gasTxCount >= MAX_GAS_TXS_PER_HOUR) {
            return {
                allowed: false,
                error: `Rate limit exceeded. Max ${MAX_GAS_TXS_PER_HOUR} transactions per hour. Try again in ${minutesUntilReset} minutes.`,
                remaining: 0,
                minutesUntilReset
            };
        }
        record.gasTxCount++;
        store[key] = record;
        saveRateLimits(store);
        return {
            allowed: true,
            remaining: MAX_GAS_TXS_PER_HOUR - record.gasTxCount,
            minutesUntilReset
        };
    } else {
        if (record.readCount >= MAX_READS_PER_HOUR) {
            return {
                allowed: false,
                error: `Read rate limit exceeded. Max ${MAX_READS_PER_HOUR} per hour.`,
                remaining: MAX_GAS_TXS_PER_HOUR - record.gasTxCount,
                minutesUntilReset
            };
        }
        record.readCount++;
        store[key] = record;
        saveRateLimits(store);
        return {
            allowed: true,
            remaining: MAX_GAS_TXS_PER_HOUR - record.gasTxCount,
            minutesUntilReset
        };
    }
}

export function getRateLimitStatus(walletAddress: string): {
    remaining: number;
    maxTransactions: number;
    minutesUntilReset: number;
} {
    const key = walletAddress.toLowerCase();
    const now = Date.now();
    const store = loadRateLimits();
    const record = store[key];

    if (!record || now > record.resetTime) {
        return {
            remaining: MAX_GAS_TXS_PER_HOUR,
            maxTransactions: MAX_GAS_TXS_PER_HOUR,
            minutesUntilReset: 1440
        };
    }

    const msRemaining = Math.max(0, record.resetTime - now);
    const minutesUntilReset = Math.ceil(msRemaining / 60000);

    return {
        remaining: Math.max(0, MAX_GAS_TXS_PER_HOUR - record.gasTxCount),
        maxTransactions: MAX_GAS_TXS_PER_HOUR,
        minutesUntilReset
    };
}
