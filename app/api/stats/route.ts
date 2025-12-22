import { NextRequest, NextResponse } from 'next/server';
import { auditService } from '@/services/auditService';
import { serverEnclave } from '@/services/serverEnclave';

export async function GET(req: NextRequest) {
    if (!serverEnclave.isUnlocked()) {
        return NextResponse.json({ secretCount: 0, apiUsageCount: 0 });
    }

    const owner = serverEnclave.getOwner();
    const ownerHeader = req.headers.get('x-enclave-owner');
    const effectiveOwner = owner || ownerHeader || '';

    // Get isolated stats
    const secretCount = serverEnclave.getKeyCount(effectiveOwner || undefined);

    // Count API calls for THIS user ONLY - strict matching
    const allLogs = auditService.getLogs(1000);
    const apiUsageCount = allLogs.filter(log => {
        if (log.event !== 'Private API Call') return false;
        if (!effectiveOwner) return false;

        const ownerLower = effectiveOwner.toLowerCase();
        const userLower = (log.user || '').toLowerCase();

        // Only count if the log.user is the EXACT owner address
        // This ensures each user only sees their own API calls
        return userLower === ownerLower;
    }).length;

    return NextResponse.json({
        secretCount,
        apiUsageCount
    });
}
