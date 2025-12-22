import { NextRequest, NextResponse } from 'next/server';
import { chatEnclave } from '@/services/chatEnclave';

/**
 * POST /api/chat/auth
 * Authenticate user and issue chat session token
 * 
 * Requires:
 * - x-enclave-key: Wallet-derived enclave key
 * - x-enclave-owner: Wallet address
 */
export async function POST(req: NextRequest) {
    try {
        const enclaveKey = req.headers.get('x-enclave-key');
        const walletAddress = req.headers.get('x-enclave-owner');

        if (!enclaveKey || !walletAddress) {
            return NextResponse.json(
                { error: 'Authentication required. Please login with your wallet.' },
                { status: 401 }
            );
        }

        // Create anonymous session for this wallet
        const session = chatEnclave.createAnonymousSession(walletAddress);

        // Generate JWT for socket authentication
        const token = chatEnclave.generateChatToken(walletAddress, session);

        return NextResponse.json({
            success: true,
            anonymousId: session.anonymousId,
            token,
            expiresAt: session.expiresAt,
            message: 'Chat session created. Your identity is anonymous to other users.'
        });

    } catch (error) {
        console.error('[Chat Auth] Error:', error);
        return NextResponse.json(
            { error: 'Failed to create chat session' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/chat/auth
 * Get current session status
 */
export async function GET(req: NextRequest) {
    try {
        const walletAddress = req.headers.get('x-enclave-owner');

        if (!walletAddress) {
            return NextResponse.json({ authenticated: false });
        }

        const session = chatEnclave.getSession(walletAddress);

        if (!session) {
            return NextResponse.json({ authenticated: false });
        }

        return NextResponse.json({
            authenticated: true,
            anonymousId: session.anonymousId,
            expiresAt: session.expiresAt,
            activeUsers: chatEnclave.getActiveSessionCount()
        });

    } catch (error) {
        console.error('[Chat Auth] Error:', error);
        return NextResponse.json({ authenticated: false });
    }
}

/**
 * DELETE /api/chat/auth
 * Destroy chat session (logout)
 */
export async function DELETE(req: NextRequest) {
    try {
        const walletAddress = req.headers.get('x-enclave-owner');

        if (walletAddress) {
            chatEnclave.destroySession(walletAddress);
        }

        return NextResponse.json({ success: true, message: 'Session destroyed' });

    } catch (error) {
        console.error('[Chat Auth] Error:', error);
        return NextResponse.json({ error: 'Failed to destroy session' }, { status: 500 });
    }
}
