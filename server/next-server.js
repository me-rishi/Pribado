const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const crypto = require('crypto');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const ENCLAVE_SECRET = process.env.ENCLAVE_SECRET || 'default-chat-secret';

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// JWT Verification Logic (Same as before)
function verifyChatToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        if (!header || !payload || !signature) return null;

        const expectedSignature = crypto
            .createHmac('sha256', ENCLAVE_SECRET)
            .update(`${header}.${payload}`)
            .digest('base64url');

        if (signature !== expectedSignature) return null;

        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (decoded.exp < Math.floor(Date.now() / 1000)) return null;

        return { wallet: decoded.wallet, anonId: decoded.anonId };
    } catch (error) {
        console.error('[ChatServer] JWT verification failed:', error);
        return null;
    }
}

app.prepare().then(() => {
    const httpServer = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // Attach Socket.IO to the SAME HTTP server
    const io = new Server(httpServer, {
        cors: {
            origin: ['http://localhost:3000', 'https://pribado.dev', 'http://152.42.243.67'],
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));

        const verified = verifyChatToken(token);
        if (!verified) return next(new Error('Invalid or expired token'));

        socket.wallet = verified.wallet;
        socket.anonymousId = verified.anonId;
        console.log(`[ChatServer] ✓ User authenticated: ${verified.anonId}`);
        next();
    });

    // Connection Handler
    io.on('connection', (socket) => {
        console.log(`[ChatServer] Connected: ${socket.anonymousId} (${io.sockets.sockets.size} online)`);
        io.emit('user_count', io.sockets.sockets.size);

        socket.on('encrypted_message', (payload) => {
            if (payload.sessionId !== socket.anonymousId) return;
            console.log(`[ChatServer] Message from ${socket.anonymousId}`);
            socket.broadcast.emit('encrypted_message', payload);
        });

        socket.on('disconnect', () => {
            console.log(`[ChatServer] Disconnected: ${socket.anonymousId}`);
            io.emit('user_count', io.sockets.sockets.size);
        });
    });

    httpServer.listen(port, () => {
        console.log(`\n> Ready on http://${hostname}:${port}`);
        console.log(`> Socket.IO attached to same port`);
        console.log(`> Environment: ${process.env.NODE_ENV}`);
    });

    // Cron Job: Rotate keys every minute
    setInterval(async () => {
        try {
            // Self-call the API route
            const res = await fetch(`http://localhost:${port}/api/cron/rotate`);
            if (res.ok) {
                const data = await res.json();
                if (data.rotated > 0) console.log(`[Cron] Rotated ${data.rotated} keys`);
            }
        } catch (e) {
            // Ignore errors
        }
    }, 60000);
});
