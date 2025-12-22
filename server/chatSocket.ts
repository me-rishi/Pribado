// Secure Chat WebSocket Server
// Requires JWT authentication and encrypts all messages

import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { chatEnclave, verifyChatToken, EncryptedMessage } from '../services/chatEnclave';

interface AuthenticatedSocket extends Socket {
    wallet?: string;
    anonymousId?: string;
}

let io: SocketServer | null = null;

/**
 * Initialize the secure chat socket server
 * @param server HTTP server to attach to
 */
export function initChatSocket(server: HttpServer): SocketServer {
    io = new SocketServer(server, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? 'https://pribado.dev'
                : ['http://localhost:3000', 'http://localhost:3001'],
            methods: ['GET', 'POST'],
            credentials: true
        },
        // Require TLS in production
        ...(process.env.NODE_ENV === 'production' && {
            transports: ['websocket'], // Disable polling in prod
        })
    });

    // Authentication middleware
    io.use((socket: AuthenticatedSocket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            console.log('[ChatSocket] Connection rejected: No token provided');
            return next(new Error('Authentication required'));
        }

        const verified = verifyChatToken(token);

        if (!verified) {
            console.log('[ChatSocket] Connection rejected: Invalid token');
            return next(new Error('Invalid or expired token'));
        }

        // Attach verified info to socket
        socket.wallet = verified.wallet;
        socket.anonymousId = verified.anonId;

        console.log(`[ChatSocket] Authenticated: ${verified.anonId} (wallet: ${verified.wallet.slice(0, 10)}...)`);
        next();
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        console.log(`[ChatSocket] User connected: ${socket.anonymousId}`);

        // Broadcast user count
        broadcastUserCount();

        // Handle encrypted message
        socket.on('encrypted_message', (payload: EncryptedMessage) => {
            // Verify the session ID matches
            if (payload.sessionId !== socket.anonymousId) {
                console.warn('[ChatSocket] Session ID mismatch, rejecting message');
                return;
            }

            // Broadcast to all OTHER connected clients
            socket.broadcast.emit('encrypted_message', payload);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`[ChatSocket] User disconnected: ${socket.anonymousId}`);
            broadcastUserCount();
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`[ChatSocket] Error for ${socket.anonymousId}:`, error);
        });
    });

    console.log('[ChatSocket] Secure chat server initialized');
    return io;
}

/**
 * Broadcast current user count to all clients
 */
function broadcastUserCount(): void {
    if (!io) return;

    const count = io.sockets.sockets.size;
    io.emit('user_count', count);
}

/**
 * Get the socket server instance
 */
export function getChatSocket(): SocketServer | null {
    return io;
}

export default { initChatSocket, getChatSocket };
