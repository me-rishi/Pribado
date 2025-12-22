import { NextRequest, NextResponse } from 'next/server';
import { serverEnclave } from '@/services/serverEnclave';

export async function POST(req: NextRequest) {
    try {
        // Read enclave key from headers
        const enclaveKey = req.headers.get('x-enclave-key');
        const enclaveOwner = req.headers.get('x-enclave-owner');

        if (enclaveKey && enclaveOwner) {
            serverEnclave.setSessionKey(enclaveKey, enclaveOwner);
        }

        const body = await req.json();
        const { pribadoKey } = body;

        if (!pribadoKey) {
            return NextResponse.json({ error: 'Missing pribadoKey' }, { status: 400 });
        }

        // Remove the key from the enclave
        serverEnclave.remove(pribadoKey);
        console.log(`[Enclave] Revoked key: ${pribadoKey}`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Revoke] Error:', error);
        return NextResponse.json({ error: (error as any).message || 'Revoke failed' }, { status: 500 });
    }
}
