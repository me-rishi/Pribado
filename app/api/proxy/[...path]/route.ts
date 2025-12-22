import { NextRequest, NextResponse } from 'next/server';
import { serverEnclave } from '@/services/serverEnclave';
import { auditService } from '@/services/auditService';

export async function POST(req: NextRequest, segmentData: { params: Promise<{ path: string[] }> }) {
    const params = await segmentData.params;
    return handleProxy(req, params.path);
}

export async function GET(req: NextRequest, segmentData: { params: Promise<{ path: string[] }> }) {
    const params = await segmentData.params;
    return handleProxy(req, params.path);
}

const PROVIDER_URLS: Record<string, string> = {
    'openai': 'https://api.openai.com',
    'anthropic': 'https://api.anthropic.com/v1',
    'google': 'https://generativelanguage.googleapis.com/v1beta',
    'groq': 'https://api.groq.com/openai',
    'mistral': 'https://api.mistral.ai',
    'deepseek': 'https://api.deepseek.com',
    'qwen': 'https://dashscope-intl.aliyuncs.com/compatible-mode',
    'openrouter': 'https://openrouter.ai/api',
    'brave': 'https://api.search.brave.com/res/v1',
    'tavily': 'https://api.tavily.com',
    'exa': 'https://api.exa.ai',
    'serper': 'https://google.serper.dev',
    'supabase': 'DYNAMIC',  // Special: uses x-supabase-url header
    'default': 'https://api.openai.com/v1'
};

async function handleProxy(req: NextRequest, pathSegments: string[]) {
    try {
        const enclaveKey = req.headers.get('x-enclave-key');
        const enclaveOwner = req.headers.get('x-enclave-owner');
        if (enclaveKey && enclaveOwner) {
            serverEnclave.setSessionKey(enclaveKey, enclaveOwner);
        }

        const authHeader = req.headers.get('authorization');
        const xApiKey = req.headers.get('x-api-key');

        let pribadoKey: string | null = null;
        if (authHeader?.startsWith('Bearer priv_')) {
            pribadoKey = authHeader.replace('Bearer ', '').trim();
        } else if (xApiKey?.startsWith('priv_')) {
            pribadoKey = xApiKey.trim();
        }

        if (!pribadoKey) {
            return NextResponse.json({ error: 'Missing or invalid Pribado Key' }, { status: 401 });
        }

        const rotatedKey = serverEnclave.checkAndRotate(pribadoKey);
        if (rotatedKey) {
            return NextResponse.json({
                error: 'Key has been rotated',
                message: 'Your Pribado key was rotated. Check your webhook or dashboard for the new key.',
                newKey: rotatedKey
            }, { status: 401 });
        }

        const realKey = serverEnclave.getRealKey(pribadoKey);

        if (!realKey) {
            return NextResponse.json({
                error: 'Enclave context missing. Please re-provision this key via the dashboard.'
            }, { status: 403 });
        }

        const providerKey = pathSegments[0];
        let targetBase = PROVIDER_URLS[providerKey];
        let upstreamPath = '';

        if (targetBase) {
            upstreamPath = pathSegments.slice(1).join('/');
        } else {
            targetBase = PROVIDER_URLS['default'];
            upstreamPath = pathSegments.join('/');
        }

        // Handle Supabase dynamic URL
        if (providerKey === 'supabase') {
            const supabaseUrl = req.headers.get('x-supabase-url');
            if (!supabaseUrl) {
                return NextResponse.json({ error: 'Missing x-supabase-url header for Supabase requests' }, { status: 400 });
            }
            targetBase = supabaseUrl.replace(/\/$/, ''); // Remove trailing slash
        }

        let targetUrl = `${targetBase}/${upstreamPath}`;
        console.log(`[Proxy] Routing request to ${targetUrl}`);

        const headers = new Headers(req.headers);
        headers.delete('x-api-key');
        headers.delete('authorization');
        headers.delete('x-enclave-key');
        headers.delete('x-enclave-owner');
        headers.delete('x-supabase-url');

        if (providerKey === 'anthropic') {
            headers.set('x-api-key', realKey);
        } else if (providerKey === 'google') {
            const url = new URL(targetUrl);
            url.searchParams.set('key', realKey);
            targetUrl = url.toString();
        } else if (providerKey === 'brave') {
            headers.set('X-Subscription-Token', realKey);
        } else if (providerKey === 'serper') {
            headers.set('X-API-KEY', realKey);
        } else if (providerKey === 'supabase') {
            // Supabase uses apikey header AND Authorization Bearer
            headers.set('apikey', realKey);
            headers.set('Authorization', `Bearer ${realKey}`);
        } else {
            headers.set('Authorization', `Bearer ${realKey}`);
        }

        headers.set('Content-Type', 'application/json');

        const UNSAFE_HEADERS = [
            'host', 'connection', 'upgrade', 'keep-alive', 'transfer-encoding',
            'content-length', 'expect', 'proxy-connection', 'user-agent', 'accept-encoding'
        ];
        UNSAFE_HEADERS.forEach(h => headers.delete(h));

        const anthropicVersion = req.headers.get('anthropic-version');
        if (providerKey === 'anthropic' && anthropicVersion) {
            headers.set('anthropic-version', anthropicVersion);
        }

        // FIXED STREAM LOGIC: Read body once
        const bodyText = req.method !== 'GET' ? await req.text() : undefined;

        let model = 'unknown';
        if (bodyText) {
            try {
                const json = JSON.parse(bodyText);
                if (json.model) model = json.model;
            } catch {
                // Ignore
            }
        }

        const logDetails = {
            provider: providerKey,
            path: upstreamPath,
            model: model,
            userAgent: req.headers.get('user-agent') || 'Unknown'
        };

        let auditUser = 'API Client';
        let auditSource = 'External API';

        if (enclaveOwner) {
            auditUser = enclaveOwner;
            auditSource = 'Web Dashboard';
        } else {
            // Attempt to link to the Enclave Owner (for Dashboard stats)
            const owner = serverEnclave.getOwner();
            if (owner) {
                auditUser = owner;
                auditSource = 'API Key (Owner Linked)';
            } else if (pribadoKey) {
                auditUser = `Key: ...${pribadoKey.slice(-4)}`;
            }
        }

        try {
            auditService.incrementApiUsage();
            auditService.log(
                'Private API Call',
                auditUser,
                auditSource,
                req.headers.get('x-forwarded-for') || 'Internal',
                logDetails
            );
        } catch (e) {
            console.error('[Proxy] Audit log failed (non-fatal):', e);
        }

        const res = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            body: bodyText
        });

        return new NextResponse(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
        });

    } catch (error) {
        console.error('[Proxy] Error:', error);
        return NextResponse.json({ error: 'Proxy Error' }, { status: 500 });
    }
}
