import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    // Return empty notifications for now to fix the 404 error
    return NextResponse.json({
        notifications: [],
        unreadCount: 0
    });
}

export async function POST(req: NextRequest) {
    // Mock handler for "mark all as read"
    return NextResponse.json({ success: true });
}
