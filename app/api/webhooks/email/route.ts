import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Use a consistent path for the ledger across the app
// Note: In a real diverse deployment, this should be a DB.
const LEDGER_PATH = path.join(process.cwd(), 'sapphire_ledger.json');

// This secret must match what you put in the Cloudflare Worker Environment Variables
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || 'subrosa_secure_webhook_key_2025';

// Helper to write to ledger (simulating Blockchain storage)
function storeEmail(emailData: any) {
    let ledger: { emails: any[], backups: any } = { emails: [], backups: {} };
    try {
        if (fs.existsSync(LEDGER_PATH)) {
            ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('[Webhook] Ledger read error', e);
        // Initialize if error/missing
        if (!fs.existsSync(LEDGER_PATH)) {
            fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
        }
    }

    // Deduplicate (simple check)
    const exists = ledger.emails.some((e: any) => e.emailId === emailData.emailId);
    if (exists) {
        console.log(`[Webhook] Duplicate email ${emailData.emailId}, skipping.`);
        return;
    }

    ledger.emails.push(emailData);
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
    console.log(`[Webhook] Stored email ${emailData.emailId} for ${emailData.recipient}`);
}

export async function POST(req: NextRequest) {
    try {
        // 1. Security Check
        const secret = req.headers.get('x-pribado-secret');
        if (secret !== WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // SECURITY: Check content length to prevent DoS
        const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
        const MAX_SIZE = 1024 * 1024; // 1MB max
        if (contentLength > MAX_SIZE) {
            return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
        }

        const body = await req.json();

        // 2. Validate Body - SECURITY: Strict validation
        if (!body.from || !body.to || !body.subject) {
            return NextResponse.json({ error: 'Invalid Payload' }, { status: 400 });
        }

        // SECURITY: Sanitize and validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.from) || !emailRegex.test(body.to)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // SECURITY: Limit field lengths to prevent buffer issues
        const sanitize = (str: string, maxLen: number = 1000) => {
            if (typeof str !== 'string') return '';
            return str.substring(0, maxLen);
        };

        const sanitizedFrom = sanitize(body.from, 254);
        const sanitizedTo = sanitize(body.to, 254);
        const sanitizedSubject = sanitize(body.subject, 500);
        const sanitizedBody = sanitize(body.text || body.html || '', 50000); // 50KB max body

        // 3. Construct Email Record (Matching app schema)
        const emailId = 'email_' + Date.now() + '_' + randomBytes(4).toString('hex');
        const txHash = '0x' + randomBytes(32).toString('hex');

        // Use provided timestamp or now
        const timestamp = body.timestamp ? new Date(body.timestamp).getTime() : Date.now();

        const emailRecord = {
            id: emailId,
            emailId: emailId,
            sender: sanitizedFrom,
            recipient: sanitizedTo,
            subjectHash: '0x' + randomBytes(32).toString('hex'), // Mock hash
            bodyHash: '0x' + randomBytes(32).toString('hex'),
            encryptedBody: sanitizedBody, // SECURITY: Using sanitized body
            metadata: {
                isExternal: true,
                originalSender: sanitizedFrom,
                originalRecipient: sanitizedTo,
                subject: sanitizedSubject || 'No Subject',
                timestamp: timestamp,
                isEncrypted: false
            },
            accessKey: randomBytes(32).toString('hex'),
            timestamp: timestamp,
            attestation: '{"source":"cloudflare_worker"}',
            storedOn: 'pribado_ledger',
            txHash: txHash,
            explorerUrl: `https://pribado.dev/tx/${txHash}`
        };

        // 4. Store
        storeEmail(emailRecord);

        return NextResponse.json({ success: true, id: emailId });

    } catch (error) {
        console.error('[Webhook] Error processing email:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
