import { NextRequest, NextResponse } from 'next/server';

// SECURITY: This debug endpoint has been DISABLED in production
// It was exposing sensitive key information without authentication

export async function GET(req: NextRequest) {
    // Block all access in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'This endpoint is disabled in production' },
            { status: 403 }
        );
    }

    // In development, still require a secret debug token
    const debugToken = req.headers.get('x-debug-token');
    const expectedToken = process.env.DEBUG_TOKEN;

    if (!expectedToken || debugToken !== expectedToken) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    return NextResponse.json({
        message: 'Debug endpoint disabled for security',
        note: 'Set DEBUG_TOKEN env var and pass x-debug-token header to enable in development'
    });
}
