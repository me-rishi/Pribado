import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { validateToken, recordUsage, PRICING } from '@/services/serviceToken';
import { securityCheck, SECURITY_HEADERS } from '@/services/security';
import fs from 'fs';
import path from 'path';

const LEDGER_FILE = path.join(process.cwd(), 'sapphire_ledger.json');

// Contract addresses for key derivation
const CONTRACTS = {
    testnet: {
        address: "0x07a902F10311EEEe19dd62186dC15502C62B4AFC",
        rpc: "https://testnet.sapphire.oasis.dev"
    },
    mainnet: {
        address: "0x5401b48Df9f8F6DDC98cF62af23f88211778641F",
        rpc: "https://sapphire.oasis.io"
    }
};

interface StoredSecret {
    keyId: string;
    encryptedData: string;
    metadata: {
        provider?: string;
        label?: string;
        createdAt?: number;
    };
    userId: string;
}

function loadLedger(): { emails: any[]; secrets?: StoredSecret[] } {
    try {
        if (fs.existsSync(LEDGER_FILE)) {
            return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error('[VaultRetrieve] Error loading ledger:', error);
    }
    return { emails: [], secrets: [] };
}

/**
 * GET /api/vault/retrieve
 * 
 * Retrieves encrypted secrets from the vault.
 * The returned data is still encrypted - caller must decrypt with their key.
 * 
 * Query params:
 * - userId: User's identifier
 * - keyId: Optional specific key ID to retrieve
 * - purpose: Purpose for key derivation (default: "vault")
 * - userSecret: Optional user secret for zero-knowledge mode
 * - network: testnet or mainnet (default: mainnet)
 * 
 * Returns encrypted data - caller decrypts with derived key.
 */
export async function GET(req: NextRequest) {
    try {
        // === SECURITY CHECK (Rate Limiting + IP Ban) ===
        const security = securityCheck(req);
        if (!security.allowed) {
            return NextResponse.json(
                { error: security.error?.message },
                {
                    status: security.error?.status || 429,
                    headers: {
                        ...SECURITY_HEADERS,
                        ...(security.error?.retryAfter ? { 'Retry-After': String(security.error.retryAfter) } : {})
                    }
                }
            );
        }

        // === AUTHENTICATION ===
        const authHeader = req.headers.get('authorization');
        const apiKey = req.headers.get('x-api-key');
        const token = authHeader?.replace('Bearer ', '') || apiKey;

        let tokenData = null;

        if (token) {
            tokenData = validateToken(token);
            if (!tokenData) {
                return NextResponse.json(
                    { error: 'Invalid or expired service token' },
                    { status: 401 }
                );
            }
            console.log(`[VaultRetrieve] Auth via service token: ${tokenData.tokenPrefix}`);
        } else if (!process.env.SAPPHIRE_PRIVATE_KEY) {
            return NextResponse.json(
                { error: 'Authentication required. Provide x-api-key or Authorization header.' },
                { status: 401 }
            );
        }

        // === PARSE PARAMETERS ===
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const keyId = searchParams.get('keyId');
        const purpose = searchParams.get('purpose') || 'vault';
        const userSecret = searchParams.get('userSecret') || searchParams.get('password') || '';
        const network = (searchParams.get('network') === 'testnet') ? 'testnet' : 'mainnet';
        const withDecryptionKey = searchParams.get('withKey') === 'true';

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        // Load vault data
        const ledger = loadLedger();
        const secrets = ledger.secrets || [];

        // Filter secrets for this user
        let userSecrets = secrets.filter(s => s.userId === userId);

        // If specific keyId requested
        if (keyId) {
            userSecrets = userSecrets.filter(s => s.keyId === keyId);
        }

        // Optionally include decryption key
        let decryptionKey = null;
        if (withDecryptionKey && process.env.SAPPHIRE_PRIVATE_KEY) {
            const config = CONTRACTS[network as keyof typeof CONTRACTS];
            const provider = sapphire.wrapEthereumProvider(
                new ethers.JsonRpcProvider(config.rpc) as any
            ) as any;
            const wallet = new ethers.Wallet(process.env.SAPPHIRE_PRIVATE_KEY, provider);
            const abi = ["function deriveKey(bytes32 salt) external view returns (bytes32)"];
            const contract = new ethers.Contract(config.address, abi, wallet);

            const serverSecret = process.env.ENCLAVE_SECRET || 'default-secret';
            const saltInput = userSecret
                ? `${serverSecret}:${userSecret}:${userId}:${purpose}`
                : `${serverSecret}:${userId}:${purpose}`;
            const salt = ethers.keccak256(ethers.toUtf8Bytes(saltInput));

            decryptionKey = await contract.deriveKey(salt);
        }

        // Record usage for billing
        let costUsd = 0;
        if (tokenData) {
            const usage = recordUsage(tokenData.id, tokenData.customerId, 'vault-retrieve');
            costUsd = usage.costUsd;
        }

        // Return encrypted secrets (caller must decrypt)
        return NextResponse.json({
            success: true,
            userId: userId,
            count: userSecrets.length,
            secrets: userSecrets.map(s => ({
                keyId: s.keyId,
                encryptedData: s.encryptedData,
                metadata: {
                    provider: s.metadata?.provider,
                    label: s.metadata?.label,
                    createdAt: s.metadata?.createdAt
                }
            })),
            decryptionKey: decryptionKey || undefined,
            zeroKnowledge: userSecret.length > 0,
            billing: tokenData ? {
                costUsd: costUsd,
                pricePerCall: PRICING['vault-retrieve']
            } : undefined
        });

    } catch (error) {
        console.error('[VaultRetrieve] Error:', error);
        return NextResponse.json({
            error: 'Failed to retrieve vault: ' + (error as any).message
        }, { status: 500 });
    }
}

/**
 * POST /api/vault/retrieve
 * 
 * Store a new secret in the vault.
 * Data should be pre-encrypted by the caller.
 * 
 * Body: { userId, keyId, encryptedData, metadata }
 */
export async function POST(req: NextRequest) {
    try {
        // === AUTHENTICATION ===
        const authHeader = req.headers.get('authorization');
        const apiKey = req.headers.get('x-api-key');
        const token = authHeader?.replace('Bearer ', '') || apiKey;

        let tokenData = null;

        if (token) {
            tokenData = validateToken(token);
            if (!tokenData) {
                return NextResponse.json(
                    { error: 'Invalid or expired service token' },
                    { status: 401 }
                );
            }
        } else if (!process.env.SAPPHIRE_PRIVATE_KEY) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { userId, keyId, encryptedData, metadata = {} } = body;

        if (!userId || !keyId || !encryptedData) {
            return NextResponse.json({
                error: 'Missing required fields: userId, keyId, encryptedData'
            }, { status: 400 });
        }

        // Load and update ledger
        const ledger = loadLedger();
        if (!ledger.secrets) {
            ledger.secrets = [];
        }

        // Check if key already exists
        const existingIndex = ledger.secrets.findIndex(
            s => s.userId === userId && s.keyId === keyId
        );

        const newSecret: StoredSecret = {
            keyId,
            encryptedData,
            metadata: {
                ...metadata,
                createdAt: Date.now()
            },
            userId
        };

        if (existingIndex >= 0) {
            // Update existing
            ledger.secrets[existingIndex] = newSecret;
        } else {
            // Add new
            ledger.secrets.push(newSecret);
        }

        // Save ledger
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

        // Record usage
        let costUsd = 0;
        if (tokenData) {
            const usage = recordUsage(tokenData.id, tokenData.customerId, 'vault-retrieve');
            costUsd = usage.costUsd;
        }

        return NextResponse.json({
            success: true,
            message: existingIndex >= 0 ? 'Secret updated' : 'Secret stored',
            keyId: keyId,
            billing: tokenData ? { costUsd } : undefined
        });

    } catch (error) {
        console.error('[VaultRetrieve] POST Error:', error);
        return NextResponse.json({
            error: 'Failed to store secret: ' + (error as any).message
        }, { status: 500 });
    }
}

/**
 * DELETE /api/vault/retrieve
 * 
 * Delete a secret from the vault.
 * Body: { userId, keyId }
 */
export async function DELETE(req: NextRequest) {
    try {
        // === AUTHENTICATION ===
        const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
            req.headers.get('x-api-key');

        if (token) {
            const tokenData = validateToken(token);
            if (!tokenData) {
                return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
            }
        } else if (!process.env.SAPPHIRE_PRIVATE_KEY) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body = await req.json();
        const { userId, keyId } = body;

        if (!userId || !keyId) {
            return NextResponse.json({
                error: 'Missing required fields: userId, keyId'
            }, { status: 400 });
        }

        // Load and update ledger
        const ledger = loadLedger();
        if (!ledger.secrets) {
            return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
        }

        const initialLength = ledger.secrets.length;
        ledger.secrets = ledger.secrets.filter(
            s => !(s.userId === userId && s.keyId === keyId)
        );

        if (ledger.secrets.length === initialLength) {
            return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
        }

        fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));

        return NextResponse.json({
            success: true,
            message: 'Secret deleted'
        });

    } catch (error) {
        console.error('[VaultRetrieve] DELETE Error:', error);
        return NextResponse.json({
            error: 'Failed to delete secret'
        }, { status: 500 });
    }
}
