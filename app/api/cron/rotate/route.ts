import { NextRequest, NextResponse } from 'next/server';
import { serverEnclave } from '@/services/serverEnclave';

// Ensure this is not cached
export const dynamic = 'force-dynamic';

// SECURITY: Cron secret for authenticated rotation
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
    try {
        // SECURITY: Verify the request is from internal/authorized source
        const authHeader = req.headers.get('authorization');
        const cronSecret = authHeader?.replace('Bearer ', '');

        // Allow internal requests (from localhost/container) OR valid secret
        const isInternal = req.headers.get('x-forwarded-for') === null ||
            req.headers.get('host')?.includes('localhost') ||
            req.headers.get('host')?.includes('127.0.0.1');

        const hasValidSecret = CRON_SECRET && cronSecret === CRON_SECRET;

        // In production, require either internal or valid secret
        if (process.env.NODE_ENV === 'production' && !isInternal && !hasValidSecret) {
            console.warn('[Cron] Unauthorized rotation attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = serverEnclave.rotateExpiredKeys();

        if (result.rotated > 0) {
            console.log(`[Cron] Rotated ${result.rotated} expired keys.`);
        }

        return NextResponse.json({ success: true, ...result });

    } catch (error) {
        console.error('[Cron] Rotation failed:', error);
        return NextResponse.json({ error: (error as any).message }, { status: 500 });
    }
}
