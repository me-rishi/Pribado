import { NextRequest, NextResponse } from 'next/server';

// x402 Subscription API
// POST with payment - activates subscription
// Returns 402 if no payment provided

// Facilitator URL for payment verification
const FACILITATOR_URL = process.env.NODE_ENV === 'production'
    ? 'https://x402.org/facilitator'  // Mainnet
    : 'https://x402.org/facilitator'; // Testnet (Base Sepolia)

// Payment receiving wallet
const PAYMENT_ADDRESS = process.env.PAYMENT_WALLET || '';

// Supported Networks & Assets (CAIP-2)
const NETWORK_CONFIG: Record<string, { asset: string, decimals: number, name: string }> = {
    'eip155:23295': { // Sapphire Testnet
        asset: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        name: 'ROSE'
    },
    'eip155:84532': { // Base Sepolia
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        decimals: 6,
        name: 'USDC'
    },
    'eip155:8453': { // Base Mainnet
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        name: 'USDC'
    }
};

const DEFAULT_NETWORK = process.env.NODE_ENV === 'production'
    ? 'eip155:8453'
    : 'eip155:23295';

interface SubscriptionRequest {
    days: number;
    walletAddress: string;
}

export async function GET(req: NextRequest) {
    return NextResponse.json({ error: 'Method not allowed. Use POST to activate subscription.' }, { status: 405 });
}

export async function POST(req: NextRequest) {
    try {
        const paymentSignature = req.headers.get('PAYMENT-SIGNATURE') || req.headers.get('X-PAYMENT');

        // If no payment signature, return 402 Payment Required
        if (!paymentSignature) {
            return NextResponse.json({ error: 'Payment required' }, { status: 402 });
        }

        // Payment signature provided - verify with facilitator
        const body: SubscriptionRequest = await req.json();
        const { days = 30, walletAddress } = body;

        const config = NETWORK_CONFIG[DEFAULT_NETWORK];
        const priceInDollars = Math.ceil(days / 30);
        const priceInUnits = priceInDollars * Math.pow(10, config.decimals);

        try {
            // Verify payment with x402 facilitator
            const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    paymentSignature,
                    network: DEFAULT_NETWORK,
                    payTo: PAYMENT_ADDRESS,
                    amount: priceInUnits.toString(),
                    asset: config.asset
                })
            });

            if (!verifyResponse.ok) {
                const errorData = await verifyResponse.json().catch(() => ({}));
                console.error('[x402] Verification failed:', errorData);
                return NextResponse.json(
                    { error: 'Payment verification failed', details: errorData },
                    { status: 402 }
                );
            }

            // Settle the payment
            const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    paymentSignature,
                    network: DEFAULT_NETWORK
                })
            });

            if (!settleResponse.ok) {
                console.error('[x402] Settlement failed');
                // Payment verified but settlement failed - still grant access
                // The facilitator will retry settlement
            }

            const settleData = await settleResponse.json().catch(() => ({}));

            // Payment successful - return subscription details
            const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

            console.log(`[x402] Subscription activated: ${walletAddress} for ${days} days`);

            return NextResponse.json({
                success: true,
                subscription: {
                    walletAddress,
                    days,
                    expiresAt,
                    txHash: settleData.txHash || 'pending'
                }
            }, {
                headers: {
                    'PAYMENT-RESPONSE': JSON.stringify(settleData)
                }
            });

        } catch (facilitatorError) {
            console.error('[x402] Facilitator error:', facilitatorError);
            return NextResponse.json(
                { error: 'Payment processing error' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('[Subscription API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
