import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Configuration
const DOMAIN = 'pribado.dev';
const LEDGER_PATH = path.join(process.cwd(), 'sapphire_ledger.json');

// Helper to write to ledger (simulating Blockchain storage)
function storeEmail(emailData: any) {
    let ledger: { emails: any[], backups: any } = { emails: [], backups: {} };
    try {
        if (fs.existsSync(LEDGER_PATH)) {
            ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
        }
    } catch (e) { console.error('Ledger read error', e); }

    // Deduplicate (simple check)
    const exists = ledger.emails.some((e: any) => e.emailId === emailData.emailId);
    if (exists) return;

    ledger.emails.push(emailData);
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
    console.log(`[SMTP] Stored email ${emailData.emailId} for ${emailData.recipient}`);
}

const server = new SMTPServer({
    // Disable authentication for incoming mail (standard for MX servers)
    disabledCommands: ['AUTH'],

    // Secure params (starttls optional but good)
    secure: false,

    // Handle incoming data
    onData(stream, session, callback) {
        simpleParser(stream, async (err, parsed) => {
            if (err) {
                console.error('[SMTP] Parse Error:', err);
                return callback(new Error('Failed to parse email'));
            }

            const recipient = session.envelope.rcptTo[0].address;
            const sender = session.envelope.mailFrom ? session.envelope.mailFrom.address : 'unknown';

            // Filter for our domain
            if (!recipient.endsWith(`@${DOMAIN}`)) {
                console.log(`[SMTP] Rejected external recipient: ${recipient}`);
                // Generally we accept to avoid leaking user info, but log it.
            }

            console.log(`[SMTP] Received email from ${sender} to ${recipient}`);

            // Simulate "Encrypting Body" (In real app, fetch User's Public Key here)
            // For now, we store plain text body but mark it as needing encryption if we had the key

            const emailId = 'email_' + Date.now() + '_' + randomBytes(4).toString('hex');
            const txHash = '0x' + randomBytes(32).toString('hex');

            const emailRecord = {
                id: emailId,
                emailId: emailId,
                sender: sender,
                recipient: recipient,
                subjectHash: '0x' + randomBytes(32).toString('hex'), // Mock hash
                bodyHash: '0x' + randomBytes(32).toString('hex'),
                encryptedBody: parsed.text || parsed.html || '', // Storing plain for MVP, usually encrypted
                metadata: {
                    isExternal: true,
                    originalSender: sender,
                    originalRecipient: recipient,
                    subject: parsed.subject || 'No Subject',
                    timestamp: Date.now(),
                    isEncrypted: false // Flag to UI that this came plainly
                },
                accessKey: randomBytes(32).toString('hex'),
                timestamp: Date.now(),
                attestation: '{"mock":"smtp_ingress"}',
                storedOn: 'pribado_smtp_native',
                txHash: txHash,
                explorerUrl: `https://pribado.dev/tx/${txHash}`
            };

            storeEmail(emailRecord);
            callback();
        });
    },

    // Verify Recipient (Optional: Check if alias exists)
    onRcptTo(address, session, callback) {
        // Accept all emails to our domain for now (Catch-all)
        // In future: Check against `rofl_aliases`
        if (address.address.endsWith(DOMAIN)) {
            return callback();
        }
        return callback(new Error('Relay access denied'));
    }
});

server.on('error', err => {
    console.error('[SMTP] Server Error:', err);
});

// Start Server on Port 2525 (Non-privileged for Docker user)
server.listen(2525, () => {
    console.log(`🚀 Pribado SMTP Server listening on Port 2525 [${DOMAIN}]`);
});
