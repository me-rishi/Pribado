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
        const { pribadoKeys } = body; // Array of keys to check

        if (!pribadoKeys || !Array.isArray(pribadoKeys)) {
            return NextResponse.json({ error: 'Missing pribadoKeys array' }, { status: 400 });
        }

        // Check which keys are provisioned and get rotation info
        const provisioned: string[] = [];
        const rotationInfo: Record<string, { interval: number; expiresIn: number } | null> = {};
        const keyUpdates: Record<string, string> = {}; // Map sentKey -> currentKey

        for (const key of pribadoKeys) {
            // 1. Find the current active key (resolving history/origin)
            let currentKey = serverEnclave.findCurrentKey(key);

            // 2. opportunistic rotation: If it's expired, rotate it NOW so the UI sees the new one
            if (currentKey) {
                const rotated = serverEnclave.checkAndRotate(currentKey);
                if (rotated) {
                    console.log(`[Check] Rotate triggered for ${currentKey} -> ${rotated}`);
                    currentKey = rotated;
                }
            }

            // 3. Return the (possibly new) status
            if (currentKey) {
                provisioned.push(currentKey); // Add the CURRENT key
                if (currentKey !== key) {
                    keyUpdates[key] = currentKey; // Tell client about update
                }
                rotationInfo[currentKey] = serverEnclave.getRotationInfo(currentKey);
            }
        }

        return NextResponse.json({ provisioned, rotationInfo, keyUpdates });
    } catch (error) {
        console.error('[Check] Error:', error);
        return NextResponse.json({ error: (error as any).message || 'Check failed' }, { status: 500 });
    }
}
