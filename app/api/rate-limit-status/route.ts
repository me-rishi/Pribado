import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStatus } from '@/services/rateLimit';

export async function GET(req: NextRequest) {
    try {
        // Get wallet address from query param
        const walletAddress = req.nextUrl.searchParams.get('wallet') || '';

        if (!walletAddress) {
            return NextResponse.json({
                remaining: 10,
                maxTransactions: 10,
                minutesUntilReset: 1440,
                error: 'No wallet provided'
            });
        }

        const status = getRateLimitStatus(walletAddress);

        return NextResponse.json(status);

    } catch (error) {
        console.error('Rate limit status error:', error);
        return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
    }
}
