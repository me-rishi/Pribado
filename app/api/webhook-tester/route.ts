import { NextRequest, NextResponse } from 'next/server';

// SECURITY: This test endpoint has been DISABLED in production
// It allowed arbitrary JSON to be written to the filesystem

export async function POST(req: NextRequest) {
    // Block all access in production - this endpoint is a security risk
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'This endpoint is disabled in production' },
            { status: 403 }
        );
    }

    // In development, just log to console instead of writing to file
    try {
        const body = await req.json();

        console.log('\n🔵 [Webhook Tester] Received Payload:');
        console.log(JSON.stringify(body, null, 2));
        console.log('----------------------------------------\n');

        // DO NOT write to filesystem - this was a security vulnerability
        // fs.writeFileSync was allowing arbitrary content to be written

        return NextResponse.json({ received: true, note: 'File writing disabled for security' });
    } catch (error) {
        console.error('Webhook tester error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 400 });
    }
}
