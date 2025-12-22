import { NextRequest, NextResponse } from 'next/server';
import { serverEnclave } from '@/services/serverEnclave';

export async function POST(req: NextRequest) {
    try {
        // Read enclave key from headers
        const enclaveKey = req.headers.get('x-enclave-key');
        const enclaveOwner = req.headers.get('x-enclave-owner');

        if (!enclaveKey || !enclaveOwner) {
            return NextResponse.json({ error: 'Enclave not unlocked. Please login again.' }, { status: 401 });
        }

        // Set session key for this request
        serverEnclave.setSessionKey(enclaveKey, enclaveOwner);

        const body = await req.json();
        const { pribadoKey, realKey, provider, rotationInterval, webhookUrl } = body;

        if (!pribadoKey || !realKey) {
            return NextResponse.json({ error: 'Missing pribadoKey or realKey' }, { status: 400 });
        }

        // Provision the key in the server enclave with rotation settings
        serverEnclave.provision(
            pribadoKey,
            realKey.trim(),
            (provider || 'unknown').trim().toLowerCase(),
            rotationInterval || 0,
            webhookUrl
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Provision] Error:', error);
        return NextResponse.json({ error: (error as any).message || 'Provisioning failed' }, { status: 500 });
    }
}
