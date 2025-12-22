
import { NextRequest, NextResponse } from 'next/server';
import { auditService } from '@/services/auditService';
import { serverEnclave } from '@/services/serverEnclave';

export async function POST(req: NextRequest) {
    if (!serverEnclave.isUnlocked()) {
        return NextResponse.json({ error: 'Enclave locked' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const { event, details } = body;
        const owner = req.headers.get('x-enclave-owner') || 'Unknown';
        const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

        // Log to secure audit log
        auditService.log(
            event || 'Key Access',
            owner,
            'Web Client',
            ip,
            details
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Audit log failed:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
