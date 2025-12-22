import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceToken, PRICING, getCustomerTokens } from '@/services/serviceToken';
import fs from 'fs';
import path from 'path';

// x402 webhook secret for verifying requests
const X402_WEBHOOK_SECRET = process.env.X402_WEBHOOK_SECRET || '';

// Payment records storage
const PAYMENTS_FILE = path.join(process.cwd(), 'data', 'x402_payments.json');

interface PaymentRecord {
    paymentId: string;
    customerId: string;
    amount: number;
    currency: string;
    status: 'completed' | 'failed' | 'refunded';
    tokenId?: string;
    createdAt: number;
}

interface X402PaymentEvent {
    type: 'payment.completed' | 'payment.failed' | 'payment.refunded' |
    'subscription.created' | 'subscription.cancelled';
    data: {
        paymentId: string;
        customerId: string;        // Customer's wallet address or email
        customerEmail?: string;
        amount: number;            // Amount in USD cents
        currency: string;
        transactionHash?: string;  // On-chain payment tx
        metadata?: {
            tokenName?: string;
            expiresInDays?: number;
            plan?: 'starter' | 'pro' | 'enterprise';
        };
    };
    timestamp: number;
    signature?: string;
}

// Load payment records
function loadPayments(): { payments: PaymentRecord[] } {
    try {
        if (fs.existsSync(PAYMENTS_FILE)) {
            return JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8'));
        }
    } catch (error) {
        console.error('[x402] Error loading payments:', error);
    }
    return { payments: [] };
}

// Save payment records
function savePayments(data: { payments: PaymentRecord[] }): void {
    try {
        const dir = path.dirname(PAYMENTS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('[x402] Error saving payments:', error);
    }
}

// Verify x402 webhook signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) {
        console.warn('[x402] No webhook secret configured - accepting all webhooks (dev mode)');
        return true;
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature || ''),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

/**
 * POST /api/webhooks/x402
 * 
 * Handles payment webhooks from x402 marketplace.
 * Events:
 * - payment.completed: Issue service token to customer
 * - payment.failed: Log failure
 * - payment.refunded: Revoke token
 * - subscription.created: Create recurring token
 * - subscription.cancelled: Revoke tokens
 */
export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const signature = req.headers.get('x-x402-signature') ||
            req.headers.get('x-webhook-signature') || '';

        // Verify webhook signature
        if (!verifySignature(rawBody, signature, X402_WEBHOOK_SECRET)) {
            console.error('[x402] Invalid webhook signature');
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 401 }
            );
        }

        const event: X402PaymentEvent = JSON.parse(rawBody);
        console.log(`[x402] Received event: ${event.type} for ${event.data.customerId}`);

        const paymentsData = loadPayments();

        switch (event.type) {
            case 'payment.completed': {
                const { paymentId, customerId, amount, currency, metadata, transactionHash } = event.data;

                // Check for duplicate payment
                const existingPayment = paymentsData.payments.find(p => p.paymentId === paymentId);
                if (existingPayment) {
                    console.log(`[x402] Duplicate payment ${paymentId}, skipping`);
                    return NextResponse.json({
                        success: true,
                        message: 'Payment already processed',
                        tokenPrefix: existingPayment.tokenId
                    });
                }

                // Create a service token for the customer
                const { tokenData, rawToken } = createServiceToken({
                    customerId: customerId.toLowerCase(),
                    name: metadata?.tokenName || `x402-${paymentId.slice(0, 8)}`,
                    expiresInDays: metadata?.expiresInDays || null
                });

                // Record payment
                const paymentRecord: PaymentRecord = {
                    paymentId,
                    customerId: customerId.toLowerCase(),
                    amount,
                    currency,
                    status: 'completed',
                    tokenId: tokenData.id,
                    createdAt: Date.now()
                };
                paymentsData.payments.push(paymentRecord);
                savePayments(paymentsData);

                console.log(`[x402] Created token ${tokenData.tokenPrefix} for payment ${paymentId}`);

                // Calculate what the payment buys
                const amountUsd = amount / 100; // cents to dollars
                const estimatedDeriveKeyCalls = Math.floor(amountUsd / PRICING['derive-key']);
                const estimatedProxyCalls = Math.floor(amountUsd / PRICING['proxy']);

                return NextResponse.json({
                    success: true,
                    message: 'Payment processed - service token created',
                    token: rawToken,  // Return token in webhook response
                    tokenPrefix: tokenData.tokenPrefix,
                    paymentId: paymentId,
                    transactionHash: transactionHash,
                    credits: {
                        amountUsd: amountUsd,
                        estimatedDeriveKeyCalls,
                        estimatedProxyCalls
                    },
                    usage: {
                        deriveKey: `$${PRICING['derive-key']}/call`,
                        proxy: `$${PRICING['proxy']}/call`,
                        vaultRetrieve: `$${PRICING['vault-retrieve']}/call`
                    },
                    endpoints: {
                        deriveKey: '/api/derive-key',
                        proxy: '/api/proxy/*',
                        vault: '/api/vault/retrieve'
                    }
                });
            }

            case 'payment.failed': {
                const { paymentId, customerId } = event.data;

                // Record failed payment
                paymentsData.payments.push({
                    paymentId,
                    customerId: customerId.toLowerCase(),
                    amount: event.data.amount,
                    currency: event.data.currency,
                    status: 'failed',
                    createdAt: Date.now()
                });
                savePayments(paymentsData);

                console.log(`[x402] Payment failed: ${paymentId}`);

                return NextResponse.json({
                    success: true,
                    message: 'Payment failure recorded'
                });
            }

            case 'payment.refunded': {
                const { paymentId, customerId } = event.data;

                // Find and revoke associated token
                const payment = paymentsData.payments.find(p => p.paymentId === paymentId);
                if (payment && payment.tokenId) {
                    // Mark payment as refunded
                    payment.status = 'refunded';
                    savePayments(paymentsData);

                    // TODO: Revoke the token
                    console.log(`[x402] Refund processed for ${paymentId}, token should be revoked`);
                }

                return NextResponse.json({
                    success: true,
                    message: 'Refund processed'
                });
            }

            case 'subscription.created': {
                const { customerId, metadata } = event.data;

                // Create a long-lived token for subscription
                const { tokenData, rawToken } = createServiceToken({
                    customerId: customerId.toLowerCase(),
                    name: `subscription-${metadata?.plan || 'pro'}`,
                    expiresInDays: 30 // Monthly
                });

                console.log(`[x402] Subscription created for ${customerId}: ${tokenData.tokenPrefix}`);

                return NextResponse.json({
                    success: true,
                    message: 'Subscription activated',
                    token: rawToken,
                    tokenPrefix: tokenData.tokenPrefix,
                    plan: metadata?.plan || 'pro',
                    expiresAt: tokenData.expiresAt
                });
            }

            case 'subscription.cancelled': {
                const { customerId } = event.data;

                // Get all tokens for this customer
                const customerTokens = getCustomerTokens(customerId.toLowerCase());

                console.log(`[x402] Subscription cancelled for ${customerId}, ${customerTokens.length} tokens affected`);

                return NextResponse.json({
                    success: true,
                    message: 'Subscription cancelled',
                    tokensAffected: customerTokens.length
                });
            }

            default:
                console.log(`[x402] Unhandled event type: ${event.type}`);
                return NextResponse.json({
                    success: true,
                    message: 'Event acknowledged'
                });
        }

    } catch (error) {
        console.error('[x402] Webhook error:', error);
        return NextResponse.json(
            { error: 'Webhook processing failed: ' + (error as any).message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/webhooks/x402
 * 
 * API info for x402 marketplace integration.
 * This is the public-facing documentation endpoint.
 */
export async function GET() {
    return NextResponse.json({
        service: 'Pribado Secrets-as-a-Service',
        version: '1.0.0',
        status: 'active',

        description: 'TEE-backed key derivation and secrets management',

        pricing: {
            model: 'pay-as-you-go',
            currency: 'USD',
            endpoints: {
                'GET /api/derive-key': {
                    price: PRICING['derive-key'],
                    description: 'Derive unique encryption key from TEE',
                    params: ['userId', 'purpose', 'userSecret?', 'network?']
                },
                'POST /api/proxy/*': {
                    price: PRICING['proxy'],
                    description: 'Proxy API calls with secure key injection'
                },
                'GET /api/vault/retrieve': {
                    price: PRICING['vault-retrieve'],
                    description: 'Retrieve encrypted secrets from vault',
                    params: ['userId', 'keyId?', 'withKey?']
                }
            }
        },

        authentication: {
            type: 'bearer',
            header: 'Authorization: Bearer prb_xxx...',
            alternative: 'x-api-key: prb_xxx...',
            howToGet: 'Pay via x402 → Receive token in webhook response'
        },

        features: [
            'Hardware TEE (Sapphire) backed key derivation',
            'Zero-knowledge mode with user secrets',
            'Deterministic keys (no storage needed)',
            'Multi-tenant isolation',
            'Pay-as-you-go billing',
            'Usage tracking & dashboard'
        ],

        webhook: {
            url: '/api/webhooks/x402',
            method: 'POST',
            events: [
                'payment.completed',
                'payment.failed',
                'payment.refunded',
                'subscription.created',
                'subscription.cancelled'
            ],
            signatureHeader: 'x-x402-signature',
            signatureAlgorithm: 'HMAC-SHA256'
        },

        links: {
            documentation: 'https://pribado.dev/docs',
            dashboard: 'https://pribado.dev/usage',
            support: 'https://pribado.dev/contact'
        }
    });
}
