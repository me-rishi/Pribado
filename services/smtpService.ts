import nodemailer from 'nodemailer';

// SMTP Configuration
// Cleaned up for Direct Send Mode
export const verifySMTP = async () => true;

import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

// Direct Send Logic (Sender -> Recipient's MX)
async function sendDirectly(to: string, mailOptions: any) {
  const domain = to.split('@')[1];
  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) throw new Error('No MX records found');

    // Sort by priority
    mxRecords.sort((a, b) => a.priority - b.priority);
    const bestMx = mxRecords[0].exchange;

    const directTransporter = nodemailer.createTransport({
      host: bestMx,
      port: 25,
      secure: false,
      name: 'pribado.dev', // HELO hostname
      connectionTimeout: 5000, // 5 seconds timeout
      greetingTimeout: 5000,
      socketTimeout: 5000,
      tls: {
        rejectUnauthorized: false
      }
    } as any);

    return await directTransporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Direct send failed:', error);
    throw error;
  }
}

// Send TEE-secured email notification
export async function sendSecureEmailNotification(
  recipientEmail: string,
  senderEmail: string,
  subject: string,
  secureLink: string,
  emailId: string
): Promise<boolean> {
  try {
    // Minimal Secure Notification Template
    const htmlTemplate = `
      <body style="background:#000;color:#fff;font-family:sans-serif;padding:20px;text-align:center;">
        <h2 style="color:#10b981;margin-bottom:30px;">🔐 Secure Message</h2>
        <a href="${secureLink}" style="background:#10b981;color:#fff;padding:15px 30px;text-decoration:none;border-radius:5px;font-weight:bold;">Decrypt Message</a>
        <p style="color:#555;font-size:12px;margin-top:30px;">From: ${senderEmail}</p>
        <p style="color:#555;font-size:12px;">ID: ${emailId}</p>
      </body>
    `;

    const textTemplate = `Secure Message from ${senderEmail}: ${secureLink}`;

    // Send email
    // Use the direct send logic if we are in production/direct mode
    // We already try direct sending inside this function in previous steps? 
    // Wait, the previous code had "sendDirectly" call. I must preserve it.

    const mailOptions = {
      from: `"Pribado Secure" <admin@pribado.dev>`,
      to: recipientEmail,
      subject: `🔐 Encrypted V2: ${subject}`,
      text: textTemplate,
      html: htmlTemplate,
    };

    console.log(`[SMTP] Attempting direct delivery to ${recipientEmail}`);
    await sendDirectly(recipientEmail, mailOptions);
    console.log('✅ Notification email sent directly via MX');

    return true;
  } catch (error) {
    console.error('❌ Failed to send notification email:', error);
    return false;
  }
}
