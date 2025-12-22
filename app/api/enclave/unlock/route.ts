import { NextRequest, NextResponse } from 'next/server';
import { serverEnclave } from '@/services/serverEnclave';

// In-memory session store for enclave keys (per-request, not persisted)
// In production, you'd use Redis or similar for multi-instance support
const enclaveSession: { key: string | null; owner: string | null } = {
    key: null,
    owner: null
};

// SECURITY: Rate limiting to prevent brute force attacks
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return false;
    }

    record.count++;
    if (record.count > MAX_ATTEMPTS) {
        return true;
    }

    return false;
}

export async function POST(req: NextRequest) {
    try {
        // SECURITY: Rate limiting
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
            req.headers.get('x-real-ip') ||
            'unknown';

        if (isRateLimited(ip)) {
            console.warn(`[Enclave] Rate limit exceeded for ${ip}`);
            return NextResponse.json(
                { error: 'Too many unlock attempts. Try again later.' },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { enclaveKey, owner } = body;

        if (!enclaveKey || !owner) {
            return NextResponse.json({ error: 'Missing enclaveKey or owner' }, { status: 400 });
        }

        // Store in session
        enclaveSession.key = enclaveKey;
        enclaveSession.owner = owner;

        // Set the enclave session key for the server enclave
        serverEnclave.setSessionKey(enclaveKey, owner);

        console.log(`[Enclave] Session unlocked for ${owner}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Enclave] Unlock error:', error);
        return NextResponse.json({ error: 'Unlock failed' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        unlocked: !!enclaveSession.key,
        owner: enclaveSession.owner
    });
}
