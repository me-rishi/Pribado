import { NextRequest, NextResponse } from 'next/server';
import { getBannedIPs, unbanIP, banIP, SECURITY_HEADERS } from '@/services/security';

/**
 * GET /api/admin/security
 * 
 * Admin endpoint to view banned IPs and security stats.
 * Requires admin authentication.
 */
export async function GET(req: NextRequest) {
    try {
        // Admin authentication - check for admin token
        const adminToken = req.headers.get('x-admin-token');
        const expectedToken = process.env.ADMIN_TOKEN || process.env.ENCLAVE_SECRET?.slice(0, 32);

        if (!adminToken || adminToken !== expectedToken) {
            return NextResponse.json(
                { error: 'Admin authentication required' },
                { status: 401, headers: SECURITY_HEADERS }
            );
        }

        const bannedIPs = getBannedIPs();

        // Group by ban reason
        const stats = {
            total: bannedIPs.length,
            spam: bannedIPs.filter(b => b.reason === 'spam').length,
            abuse: bannedIPs.filter(b => b.reason === 'abuse').length,
            permanent: bannedIPs.filter(b => b.reason === 'permanent' || !b.expiresAt).length,
            tempBans: bannedIPs.filter(b => b.expiresAt && b.expiresAt > Date.now()).length
        };

        return NextResponse.json({
            success: true,
            stats,
            bannedIPs: bannedIPs.map(b => ({
                ip: b.ip,
                reason: b.reason,
                bannedAt: new Date(b.bannedAt).toISOString(),
                expiresAt: b.expiresAt ? new Date(b.expiresAt).toISOString() : 'permanent',
                isExpired: b.expiresAt ? b.expiresAt < Date.now() : false
            }))
        }, { headers: SECURITY_HEADERS });

    } catch (error) {
        console.error('[Admin/Security] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get security stats' },
            { status: 500, headers: SECURITY_HEADERS }
        );
    }
}

/**
 * POST /api/admin/security
 * 
 * Admin endpoint to ban/unban IPs.
 * Body: { action: 'ban' | 'unban', ip: string, reason?: string, hours?: number }
 */
export async function POST(req: NextRequest) {
    try {
        // Admin authentication
        const adminToken = req.headers.get('x-admin-token');
        const expectedToken = process.env.ADMIN_TOKEN || process.env.ENCLAVE_SECRET?.slice(0, 32);

        if (!adminToken || adminToken !== expectedToken) {
            return NextResponse.json(
                { error: 'Admin authentication required' },
                { status: 401, headers: SECURITY_HEADERS }
            );
        }

        const body = await req.json();
        const { action, ip, reason = 'abuse', hours } = body;

        if (!action || !ip) {
            return NextResponse.json(
                { error: 'Missing required fields: action, ip' },
                { status: 400, headers: SECURITY_HEADERS }
            );
        }

        if (action === 'ban') {
            banIP(ip, reason as 'spam' | 'abuse' | 'permanent', hours);
            return NextResponse.json({
                success: true,
                message: `IP banned for ${hours ? hours + ' hours' : 'permanently'}`,
                ip
            }, { headers: SECURITY_HEADERS });
        }

        if (action === 'unban') {
            const success = unbanIP(ip);
            if (success) {
                return NextResponse.json({
                    success: true,
                    message: 'IP unbanned',
                    ip
                }, { headers: SECURITY_HEADERS });
            } else {
                return NextResponse.json(
                    { error: 'IP not found in ban list' },
                    { status: 404, headers: SECURITY_HEADERS }
                );
            }
        }

        return NextResponse.json(
            { error: 'Invalid action. Use "ban" or "unban"' },
            { status: 400, headers: SECURITY_HEADERS }
        );

    } catch (error) {
        console.error('[Admin/Security] Error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500, headers: SECURITY_HEADERS }
        );
    }
}
