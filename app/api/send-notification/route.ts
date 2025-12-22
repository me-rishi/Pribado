import { NextRequest, NextResponse } from 'next/server';
import { sendSecureEmailNotification } from '@/services/smtpService';

export async function POST(req: NextRequest) {
    try {
        const { recipientEmail, senderEmail, subject, secureLink, emailId } = await req.json();

        if (!recipientEmail || !senderEmail || !emailId) {
            return NextResponse.json({ success: false, error: 'Resing required fields' }, { status: 400 });
        }

        const success = await sendSecureEmailNotification(
            recipientEmail,
            senderEmail,
            subject || 'Secure Message',
            secureLink,
            emailId
        );

        return NextResponse.json({ success });

    } catch (error) {
        console.error('Notification API Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Error' }, { status: 500 });
    }
}
