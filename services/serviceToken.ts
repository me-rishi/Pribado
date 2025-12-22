import crypto from 'crypto';
import {
    getServiceToken as dbGetServiceToken,
    createServiceToken as dbCreateServiceToken,
    getCustomerTokens as dbGetCustomerTokens,
    revokeServiceToken as dbRevokeServiceToken,
    recordUsage as dbRecordUsage,
    getUsageSummary as dbGetUsageSummary,
    getUsageByToken
} from './db';

// Pricing per endpoint (pay-as-you-go model)
export const PRICING: Record<string, number> = {
    'derive-key': 0.001,      // $0.001 per call
    'proxy': 0.005,           // $0.005 per call  
    'vault-retrieve': 0.002,  // $0.002 per call
    'default': 0.001          // Default rate
};

// Token prefix for identification
const TOKEN_PREFIX = 'prb_';

export interface ServiceToken {
    id: string;
    tokenHash: string;
    tokenPrefix: string;
    customerId: string;
    name: string;
    createdAt: number;
    expiresAt: number | null;
    revoked: boolean;
}

// Generate a secure random token
function generateSecureToken(): string {
    const randomBytes = crypto.randomBytes(32);
    const token = TOKEN_PREFIX + randomBytes.toString('hex');
    return token;
}

// Hash a token for storage
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Create a new service token
export function createServiceToken(options: {
    customerId: string;
    name: string;
    expiresInDays?: number | null;
}): { tokenData: ServiceToken; rawToken: string } {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const id = `tok_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = options.expiresInDays
        ? Date.now() + (options.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    // Save to database
    dbCreateServiceToken(
        id,
        tokenHash,
        rawToken.slice(0, 12) + '...',
        options.customerId.toLowerCase(),
        options.name,
        expiresAt
    );

    const tokenData: ServiceToken = {
        id,
        tokenHash,
        tokenPrefix: rawToken.slice(0, 12) + '...',
        customerId: options.customerId.toLowerCase(),
        name: options.name,
        createdAt: Date.now(),
        expiresAt,
        revoked: false
    };

    console.log(`[ServiceToken] Created token ${tokenData.tokenPrefix} for ${options.customerId}`);

    return { tokenData, rawToken };
}

// Validate a token
export function validateToken(rawToken: string): ServiceToken | null {
    if (!rawToken.startsWith(TOKEN_PREFIX)) {
        return null;
    }

    const tokenHash = hashToken(rawToken);
    const record = dbGetServiceToken(tokenHash) as any;

    if (!record) {
        return null;
    }

    // Check if expired
    if (record.expires_at && Date.now() > record.expires_at) {
        return null;
    }

    // Check if revoked
    if (record.revoked) {
        return null;
    }

    return {
        id: record.id,
        tokenHash: record.token_hash,
        tokenPrefix: record.token_prefix,
        customerId: record.customer_id,
        name: record.name,
        createdAt: record.created_at,
        expiresAt: record.expires_at,
        revoked: record.revoked === 1
    };
}

// Record API usage
export function recordUsage(tokenId: string, customerId: string, endpoint: string): { costUsd: number } {
    const endpointKey = endpoint.includes('proxy') ? 'proxy' :
        endpoint.includes('derive') ? 'derive-key' :
            endpoint.includes('vault') ? 'vault-retrieve' : 'default';

    const costUsd = PRICING[endpointKey] || PRICING.default;

    // Record to database
    dbRecordUsage(tokenId, customerId, endpoint, costUsd);

    return { costUsd };
}

// Get customer tokens
export function getCustomerTokens(customerId: string): ServiceToken[] {
    const records = dbGetCustomerTokens(customerId.toLowerCase()) as any[];

    return records.map(record => ({
        id: record.id,
        tokenHash: record.token_hash,
        tokenPrefix: record.token_prefix,
        customerId: record.customer_id,
        name: record.name,
        createdAt: record.created_at,
        expiresAt: record.expires_at,
        revoked: record.revoked === 1
    }));
}

// Get usage summary for a customer
export function getUsageSummary(customerId: string): { totalCalls: number; totalCostUsd: number; lastCall: number | null } {
    const summary = dbGetUsageSummary(customerId.toLowerCase());

    return {
        totalCalls: summary?.total_calls || 0,
        totalCostUsd: summary?.total_cost || 0,
        lastCall: summary?.last_call || null
    };
}

// Revoke a token
export function revokeToken(tokenId: string): boolean {
    const result = dbRevokeServiceToken(tokenId);
    return (result as any).changes > 0;
}

// Delete a token (same as revoke in this implementation)
export function deleteToken(tokenId: string): boolean {
    return revokeToken(tokenId);
}

// Legacy checkRateLimit function (now always returns allowed for pay-as-you-go)
export function checkRateLimit(tokenId: string): { allowed: boolean; remaining: number } {
    // Pay-as-you-go: no rate limits, just billing
    return { allowed: true, remaining: Infinity };
}
