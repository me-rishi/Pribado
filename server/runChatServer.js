// Standalone Chat Socket Server
// Run with: ENCLAVE_SECRET=xxx node server/runChatServer.js

const { createServer } = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const PORT = process.env.CHAT_PORT || 3002;
const ENCLAVE_SECRET = process.env.ENCLAVE_SECRET || 'default-chat-secret';

// Simple JWT verification
function verifyChatToken(token) {
    try {
        const [header, payload, signature] = token.split('.');

        const expectedSignature = crypto
            .createHmac('sha256', ENCLAVE_SECRET)
            .update(`${header}.${payload}`)
            .digest('base64url');

        if (signature !== expectedSignature) {
            console.log('[ChatServer] Invalid JWT signature');
            return null;
        }

        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

        if (decoded.exp < Math.floor(Date.now() / 1000)) {
            console.log('[ChatServer] JWT expired');
            return null;
        }

        return { wallet: decoded.wallet, anonId: decoded.anonId };
    } catch (error) {
        console.error('[ChatServer] JWT verification failed:', error);
        return null;
    }
}

// Create HTTP server
const httpServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pribado Chat Server Running');
});

// Create Socket.IO server with strict CORS
// SECURITY: Only allow specific origins, not wildcards
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001'];

// In production, add your domain
if (process.env.NODE_ENV === 'production') {
    ALLOWED_ORIGINS.push('https://pribado.dev', 'http://142.93.128.79');
}

const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (mobile apps, curl, etc) in dev only
            if (!origin && process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }

            if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
                console.warn(`[ChatServer] Blocked request from origin: ${origin}`);
                return callback(new Error('CORS not allowed'), false);
            }
            return callback(null, true);
        },
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        console.log('[ChatServer] Connection rejected: No token');
        return next(new Error('Authentication required'));
    }

    const verified = verifyChatToken(token);

    if (!verified) {
        console.log('[ChatServer] Connection rejected: Invalid token');
        return next(new Error('Invalid or expired token'));
    }

    socket.wallet = verified.wallet;
    socket.anonymousId = verified.anonId;

    console.log(`[ChatServer] ✓ User authenticated: ${verified.anonId}`);
    next();
});

// Handle connections
io.on('connection', (socket) => {
    console.log(`[ChatServer] Connected: ${socket.anonymousId} (${io.sockets.sockets.size} online)`);

    // Broadcast user count
    io.emit('user_count', io.sockets.sockets.size);

    // Handle messages
    socket.on('encrypted_message', (payload) => {
        if (payload.sessionId !== socket.anonymousId) {
            console.warn('[ChatServer] Session mismatch, rejecting');
            return;
        }

        console.log(`[ChatServer] Message from ${socket.anonymousId}: ${payload.content?.substring(0, 30)}...`);
        socket.broadcast.emit('encrypted_message', payload);
    });

    socket.on('disconnect', () => {
        console.log(`[ChatServer] Disconnected: ${socket.anonymousId}`);
        io.emit('user_count', io.sockets.sockets.size);
    });
});

// Start server
httpServer.listen(PORT, () => {
    console.log(`\n🔐 Pribado Secure Chat Server`);
    console.log(`   Port: ${PORT}`);
    console.log(`   CORS: localhost:3000, pribado.dev`);
    console.log(`   Status: Ready for encrypted connections\n`);

    // KEY ROTATION CRON JOB
    // Ping the Next.js API to rotate expired keys every 60 seconds
    setInterval(async () => {
        try {
            // Dynamic URL for Docker/Local support
            const apiUrl = process.env.NEXT_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/cron/rotate`);
            if (res.ok) {
                const data = await res.json();
                if (data.rotated > 0) {
                    console.log(`[Cron] Executed: Rotated ${data.rotated} keys`);
                }
            }
        } catch (e) {
            // Silent fail if next.js is down, just retry later
        }
    }, 60000); // 1 minute check
});
