import { NextRequest, NextResponse } from 'next/server';
import {
    createServiceToken,
    getCustomerTokens,
    revokeToken,
    deleteToken,
    getUsageSummary,
    PRICING,
    ServiceToken
} from '@/services/serviceToken';

/**
 * POST /api/service-tokens
 * 
 * Generate a new service token for authenticated user.
 * Requires wallet authentication (session).
 * 
 * Body: { name, expiresInDays? }
 */
export async function POST(req: NextRequest) {
    try {
        // Get customer ID from session/auth
        const authHeader = req.headers.get('x-wallet-address');

        if (!authHeader) {
            return NextResponse.json(
                { error: 'Authentication required. Provide x-wallet-address header.' },
                { status: 401 }
            );
        }

        const customerId = authHeader.toLowerCase();
        const body = await req.json();
        const { name, expiresInDays = null } = body;

        if (!name) {
            return NextResponse.json(
                { error: 'Token name is required' },
                { status: 400 }
            );
        }

        // Create the token
        const { tokenData, rawToken } = createServiceToken({
            customerId,
            name,
            expiresInDays
        });

        // Return the raw token ONCE (never shown again!)
        return NextResponse.json({
            success: true,
            message: 'Service token created. Save this token - it will not be shown again!',
            token: rawToken,
            tokenInfo: {
                id: tokenData.id,
                name: tokenData.name,
                prefix: tokenData.tokenPrefix,
                expiresAt: tokenData.expiresAt,
                createdAt: tokenData.createdAt
            },
            pricing: {
                model: 'pay-as-you-go',
                rates: PRICING,
                note: 'You are charged per API call. No monthly fees!'
            }
        });

    } catch (error) {
        console.error('[ServiceTokens] POST Error:', error);
        return NextResponse.json(
            { error: 'Failed to create token' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/service-tokens
 * 
 * List all service tokens for authenticated user with usage stats.
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('x-wallet-address');

        if (!authHeader) {
            return NextResponse.json(
                { error: 'Authentication required. Provide x-wallet-address header.' },
                { status: 401 }
            );
        }

        const customerId = authHeader.toLowerCase();
        const tokens = getCustomerTokens(customerId);

        // Get usage summary
        const usageSummary = getUsageSummary(customerId);

        // Return tokens WITHOUT the actual token values
        const safeTokens = tokens.map(t => ({
            id: t.id,
            name: t.name,
            prefix: t.tokenPrefix,
            createdAt: t.createdAt,
            expiresAt: t.expiresAt,
            lastUsedAt: t.lastUsedAt,
            totalCalls: t.totalCalls,
            totalCostUsd: t.totalCostUsd,
            isActive: t.isActive
        }));

        return NextResponse.json({
            success: true,
            tokens: safeTokens,
            usage: usageSummary,
            pricing: {
                model: 'pay-as-you-go',
                rates: PRICING
            }
        });

    } catch (error) {
        console.error('[ServiceTokens] GET Error:', error);
        return NextResponse.json(
            { error: 'Failed to list tokens' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/service-tokens
 * 
 * Revoke or delete a service token.
 * Body: { tokenId, action: 'revoke' | 'delete' }
 */
export async function DELETE(req: NextRequest) {
    try {
        const authHeader = req.headers.get('x-wallet-address');

        if (!authHeader) {
            return NextResponse.json(
                { error: 'Authentication required. Provide x-wallet-address header.' },
                { status: 401 }
            );
        }

        const customerId = authHeader.toLowerCase();
        const body = await req.json();
        const { tokenId, action = 'revoke' } = body;

        if (!tokenId) {
            return NextResponse.json(
                { error: 'tokenId is required' },
                { status: 400 }
            );
        }

        let success = false;

        if (action === 'delete') {
            success = deleteToken(tokenId, customerId);
        } else {
            success = revokeToken(tokenId, customerId);
        }

        if (!success) {
            return NextResponse.json(
                { error: 'Token not found or unauthorized' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: action === 'delete' ? 'Token deleted' : 'Token revoked'
        });

    } catch (error) {
        console.error('[ServiceTokens] DELETE Error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}
