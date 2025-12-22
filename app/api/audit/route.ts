import { NextRequest, NextResponse } from 'next/server';
import { auditService } from '@/services/auditService';
import { serverEnclave } from '@/services/serverEnclave';

export async function GET(req: NextRequest) {
    if (!serverEnclave.isUnlocked()) {
        return NextResponse.json({ logs: [] });
    }

    // Get owner from header (set by frontend)
    const owner = req.headers.get('x-enclave-owner');

    if (!owner) {
        return NextResponse.json({ logs: [] });
    }

    // Get logs
    const limit = 100;
    const allLogs = auditService.getLogs(limit);

    // STRICT SECURITY: Only show logs where log.user EXACTLY matches owner
    // This prevents ANY data leakage between users
    const ownerLower = owner.toLowerCase();
    const userLogs = allLogs.filter(log => {
        const userLower = (log.user || '').toLowerCase();
        return userLower === ownerLower;
    });

    return NextResponse.json({ logs: userLogs });
}
