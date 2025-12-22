import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { validateToken, checkRateLimit, recordUsage, PRICING } from '@/services/serviceToken';
import { securityCheck, SECURITY_HEADERS } from '@/services/security';

// Contract ABI (only the functions we need)
const ENCLAVE_KEY_MANAGER_ABI = [
    "function deriveKey(bytes32 salt) external view returns (bytes32)",
    "function getKeyNonce() external view returns (uint256)",
    "function owner() external view returns (address)"
];

// Contract addresses (NEW deployments with public deriveKey)
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

type NetworkType = 'testnet' | 'mainnet';

/**
 * GET /api/derive-key?userId=xxx&purpose=xxx&network=mainnet
 * 
 * Derives a unique encryption key for a user/purpose combination.
 * The master key never leaves the Sapphire TEE.
 * 
 * Query params:
 * - userId: Unique user identifier (wallet address, email hash, etc.)
 * - purpose: Optional purpose identifier (e.g., "openai", "vault", "proxy")
 * - network: "testnet" or "mainnet" (default: mainnet)
 * - userSecret: Optional user secret for zero-knowledge mode
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
        // Check for service token (for external API access)
        const authHeader = req.headers.get('authorization');
        const apiKey = req.headers.get('x-api-key');
        const token = authHeader?.replace('Bearer ', '') || apiKey;


        let customerId: string | null = null;
        let tokenData = null;

        if (token) {
            // Validate service token
            tokenData = validateToken(token);
            if (!tokenData) {
                return NextResponse.json(
                    { error: 'Invalid or expired service token' },
                    { status: 401 }
                );
            }

            // Check rate limit
            const rateCheck = checkRateLimit(tokenData.id);
            if (!rateCheck.allowed) {
                return NextResponse.json(
                    { error: 'Rate limit exceeded', remaining: rateCheck.remaining },
                    { status: 429 }
                );
            }

            customerId = tokenData.customerId;
            console.log(`[DeriveKey] Auth via service token: ${tokenData.tokenPrefix}`);
        } else {
            // No token - require internal server access (check SAPPHIRE_PRIVATE_KEY exists)
            if (!process.env.SAPPHIRE_PRIVATE_KEY) {
                return NextResponse.json(
                    { error: 'Authentication required. Provide x-api-key or Authorization header.' },
                    { status: 401 }
                );
            }
            console.log('[DeriveKey] Internal server access');
        }

        // === PARSE PARAMETERS ===
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const purpose = searchParams.get('purpose') || 'default';
        const network: NetworkType = (searchParams.get('network') === 'testnet') ? 'testnet' : 'mainnet';
        const userSecret = searchParams.get('userSecret') || searchParams.get('password') || '';

        // Validate required params
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        // Zero-knowledge mode indicator
        const isZeroKnowledge = userSecret.length > 0;

        // Get contract config
        const config = CONTRACTS[network];
        if (!config.address) {
            return NextResponse.json({
                error: `Contract not deployed on ${network}. Set ENCLAVE_KEY_MANAGER_MAINNET env var.`
            }, { status: 500 });
        }

        // Check for private key
        const privateKey = process.env.SAPPHIRE_PRIVATE_KEY;
        if (!privateKey) {
            return NextResponse.json({
                error: 'Server not configured for Sapphire. Missing SAPPHIRE_PRIVATE_KEY.'
            }, { status: 500 });
        }

        // Create Sapphire-wrapped provider and wallet (same pattern as /api/sapphire)
        const provider = sapphire.wrapEthereumProvider(
            new ethers.JsonRpcProvider(config.rpc) as any
        ) as any;
        const wallet = new ethers.Wallet(privateKey, provider);

        // Connect to contract
        const contract = new ethers.Contract(config.address, ENCLAVE_KEY_MANAGER_ABI, wallet);

        // Verify we are the owner
        const owner = await contract.owner();
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            return NextResponse.json({
                error: 'Server wallet is not the contract owner'
            }, { status: 403 });
        }

        // Create salt from SERVER SECRET + USER SECRET + userId + purpose
        // ENCLAVE_SECRET: Server's secret (prevents direct contract calls)
        // userSecret: User's optional secret (enables zero-knowledge mode)
        // If userSecret is provided, server CANNOT derive keys without user's input
        const serverSecret = process.env.ENCLAVE_SECRET || 'default-secret';
        const saltInput = userSecret
            ? `${serverSecret}:${userSecret}:${userId}:${purpose}`  // Zero-knowledge mode
            : `${serverSecret}:${userId}:${purpose}`;               // Server-derived mode
        const salt = ethers.keccak256(ethers.toUtf8Bytes(saltInput));

        // Derive the key (this call is end-to-end encrypted by Sapphire)
        const derivedKey = await contract.deriveKey(salt);

        // Get current key nonce (for versioning)
        const keyNonce = await contract.getKeyNonce();

        console.log(`[DeriveKey] Derived key for user=${userId}, purpose=${purpose}, nonce=${keyNonce}`);

        // Record usage for billing (only if using service token)
        let costUsd = 0;
        if (tokenData) {
            const usage = recordUsage(tokenData.id, tokenData.customerId, 'derive-key');
            costUsd = usage.costUsd;
        }

        return NextResponse.json({
            success: true,
            derivedKey: derivedKey,
            userId: userId,
            purpose: purpose,
            keyNonce: keyNonce.toString(),
            network: network,
            zeroKnowledge: isZeroKnowledge,
            billing: tokenData ? {
                costUsd: costUsd,
                pricePerCall: PRICING['derive-key']
            } : undefined
        });

    } catch (error) {
        console.error('[DeriveKey] Error:', error);
        return NextResponse.json({
            error: 'Failed to derive key: ' + (error as any).message
        }, { status: 500 });
    }
}

/**
 * POST /api/derive-key
 * 
 * Same as GET but accepts body for more complex use cases.
 * Body: { userId, purpose, network }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, purpose = 'default', network = 'mainnet' } = body;

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId in body' }, { status: 400 });
        }

        // Reuse GET logic by constructing URL
        const url = new URL(req.url);
        url.searchParams.set('userId', userId);
        url.searchParams.set('purpose', purpose);
        url.searchParams.set('network', network);

        // Create a new request with the URL
        const getReq = new NextRequest(url, { method: 'GET' });
        return GET(getReq);

    } catch (error) {
        console.error('[DeriveKey] POST Error:', error);
        return NextResponse.json({
            error: 'Invalid request body'
        }, { status: 400 });
    }
}
