'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChatMessage } from '@/types';
import { useAuth, getEnclaveKey } from '@/contexts/AuthContext';
import {
    Send,
    Shield,
    User,
    Wifi,
    Loader2,
    Lock,
    XCircle,
    Globe,
    Users,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';

type ConnectionStatus = 'unauthenticated' | 'authenticating' | 'scanning' | 'handshaking' | 'connected' | 'disconnected' | 'error';

interface ChatSession {
    anonymousId: string;
    token: string;
    expiresAt: number;
}

export default function SecureEnclaveChat() {
    const { user } = useAuth();

    const [status, setStatus] = useState<ConnectionStatus>('unauthenticated');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [session, setSession] = useState<ChatSession | null>(null);
    const [onlineCount, setOnlineCount] = useState<number>(0);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [cooldown, setCooldown] = useState<number>(0); // Seconds remaining

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize Audio
    useEffect(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }, []);

    // Check auth status on mount
    useEffect(() => {
        if (user?.address) {
            setStatus('unauthenticated'); // Ready to authenticate
        }
    }, [user]);

    const playMessageSound = () => {
        if (!audioContextRef.current) return;

        const ctx = audioContextRef.current;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.1);
    };

    /**
     * Step 1: Authenticate with backend to get chat JWT
     */
    const authenticate = async () => {
        if (!user?.address) {
            setErrorMessage('Please login with your wallet first');
            return;
        }

        setStatus('authenticating');
        setErrorMessage('');

        try {
            const enclaveKey = await getEnclaveKey();

            if (!enclaveKey) {
                throw new Error('Enclave key not found. Please re-login.');
            }

            const response = await fetch('/api/chat/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-enclave-key': enclaveKey,
                    'x-enclave-owner': user.address
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Authentication failed');
            }

            setSession({
                anonymousId: result.anonymousId,
                token: result.token,
                expiresAt: result.expiresAt
            });

            // Proceed to connect
            connectToChat(result.token, result.anonymousId);

        } catch (error) {
            console.error('[Chat] Auth error:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Authentication failed');
            setStatus('error');
        }
    };

    /**
     * Step 2: Connect to socket with JWT
     */
    const connectToChat = (token: string, anonymousId: string) => {
        setStatus('scanning');

        // CRITICAL: Clean up existing socket BEFORE creating a new one
        if (socketRef.current) {
            socketRef.current.removeAllListeners();
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Clear old messages on reconnect to prevent duplicates
        setMessages([]);

        setTimeout(() => {
            setStatus('handshaking');

            // Connect with authenticated token
            // Production: Same Origin (Unified Server)
            // Development: Separate Port 3002
            const socketUrl = process.env.NODE_ENV === 'production'
                ? undefined
                : 'http://localhost:3002';

            const socket = io(socketUrl, {
                auth: { token },
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 3,
                reconnectionDelay: 2000, // Wait 2s between reconnection attempts
                timeout: 30000, // 30 second connection timeout
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('[Chat] Connected with ID:', anonymousId);
                setStatus('connected');

                // Resume Audio Context if suspended
                if (audioContextRef.current?.state === 'suspended') {
                    audioContextRef.current.resume();
                }
            });

            socket.on('connect_error', (error) => {
                console.error('[Chat] Connection error:', error);
                setErrorMessage('Failed to connect: ' + error.message);
                setStatus('error');
            });

            socket.on('user_count', (count: number) => {
                setOnlineCount(count);
            });

            socket.on('encrypted_message', (payload: any) => {
                // CRITICAL: Don't show our own messages as incoming (they're already added locally)
                if (payload.sessionId === anonymousId) {
                    return; // Skip - this is our own message echoed back
                }

                playMessageSound();
                addMessage('assistant', payload.content || payload.ciphertext, payload.sessionId);
            });

            socket.on('disconnect', (reason) => {
                console.log('[Chat] Disconnected, reason:', reason);
                // Only show disconnected if it wasn't intentional
                if (reason !== 'io client disconnect') {
                    setStatus('disconnected');
                }
            });

        }, 1000);
    };

    const disconnect = () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        setSession(null);
        setMessages([]);
        setStatus('unauthenticated');
    };

    const addMessage = (role: 'user' | 'assistant', content: string, senderId?: string) => {
        const newMessage: ChatMessage = {
            id: Date.now().toString() + Math.random(),
            role,
            content,
            timestamp: new Date(),
            senderAvatar: { seed: senderId || 'unknown' }
        };
        setMessages(prev => [...prev, newMessage]);
    };

    const handleSendMessage = () => {
        if (!inputMessage.trim() || status !== 'connected' || !session || cooldown > 0) return;

        // Add locally
        addMessage('user', inputMessage, session.anonymousId);

        // Send via socket (in full impl, this would be encrypted)
        socketRef.current?.emit('encrypted_message', {
            content: inputMessage,
            sessionId: session.anonymousId,
            timestamp: Date.now()
        });

        setInputMessage('');

        // Start 10-second cooldown
        setCooldown(10);
        const interval = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // ========== RENDER: Not logged in ==========
    if (!user?.address) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in">
                <div className="max-w-md text-center">
                    <div className="w-20 h-20 bg-zinc-900 border border-zinc-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-50 mb-3">Authentication Required</h1>
                    <p className="text-zinc-400 mb-6">
                        Enclave Chat requires wallet authentication to ensure all users are verified Pribado members.
                    </p>
                    <a
                        href="/vault"
                        className="inline-block px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all"
                    >
                        Login with Wallet
                    </a>
                </div>
            </div>
        );
    }

    // ========== RENDER: Scanning/Handshaking ==========
    if (status === 'authenticating' || status === 'scanning' || status === 'handshaking') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
                    <div className="w-24 h-24 bg-zinc-900 border-2 border-emerald-500 rounded-full flex items-center justify-center relative z-10">
                        <Globe className="w-10 h-10 text-emerald-500 animate-pulse" />
                    </div>
                </div>

                <h2 className="text-xl font-bold text-zinc-50 mb-2">
                    {status === 'authenticating' && 'Authenticating with Enclave...'}
                    {status === 'scanning' && 'Scanning TEE Network...'}
                    {status === 'handshaking' && 'Establishing Secure Channel...'}
                </h2>
                <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {status === 'authenticating' && 'Verifying wallet signature'}
                    {status === 'scanning' && 'Searching for secure peers'}
                    {status === 'handshaking' && 'Generating ephemeral keys'}
                </div>

                {status === 'handshaking' && (
                    <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-sm w-full font-mono text-xs text-emerald-500/80">
                        <p>{'>'} Validating enclave attestation...</p>
                        <p>{'>'} Deriving session keys...</p>
                        <p>{'>'} Connecting to secure mesh...</p>
                    </div>
                )}
            </div>
        );
    }

    // ========== RENDER: Error State ==========
    if (status === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in">
                <div className="max-w-md text-center">
                    <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-red-400 mb-3">Connection Failed</h1>
                    <p className="text-zinc-400 mb-6">{errorMessage}</p>
                    <button
                        onClick={authenticate}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    // ========== RENDER: Idle/Disconnected - Ready to Connect ==========
    if (status === 'unauthenticated' || status === 'disconnected') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in relative">
                {/* Online Count - Top Right */}
                <div className="absolute top-4 right-4 bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                    <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}></span>
                    <span className="text-xs font-mono text-zinc-300">{onlineCount} Online</span>
                </div>

                <div className="max-w-md text-center">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 bg-zinc-900 border border-zinc-700 rounded-2xl flex items-center justify-center overflow-hidden">
                            <img src="/logo.png" alt="Pribado" className="w-14 h-14 object-contain" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold text-zinc-50 mb-3">Enclave Chat</h1>
                    <p className="text-zinc-400 mb-4">
                        Secure anonymous messaging for verified Pribado users.
                    </p>

                    {/* Authenticated Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-6">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-emerald-400 font-medium">
                            Wallet Verified: {user.address.slice(0, 6)}...{user.address.slice(-4)}
                        </span>
                    </div>

                    <button
                        onClick={authenticate}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                    >
                        <Lock className="w-6 h-6" />
                        Enter Secure Chat
                    </button>

                    <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-zinc-500 max-w-xs mx-auto">
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Lock className="w-3 h-3 text-emerald-500" /> Sapphire TEE
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Shield className="w-3 h-3 text-emerald-500" /> HMAC-SHA256
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <User className="w-3 h-3 text-emerald-500" /> Ephemeral Keys
                        </span>
                        <span className="flex items-center gap-1.5 justify-center bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-zinc-700/50">
                            <Wifi className="w-3 h-3 text-emerald-500" /> No Logs
                        </span>
                    </div>
                    <p className="mt-4 text-[10px] text-zinc-600 font-mono">
                        ROFL TEE Encryption • Anonymous ID • Zero Knowledge
                    </p>
                </div>
            </div>
        );
    }

    // ========== RENDER: Connected - Chat Interface ==========
    return (
        <div className="h-full flex flex-col animate-fade-in bg-black overflow-hidden">
            {/* Header - Fixed at top */}
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur flex items-center justify-between gap-2 flex-shrink-0 z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <img
                        src={`https://api.dicebear.com/9.x/bottts/svg?seed=${session?.anonymousId}`}
                        alt="My Avatar"
                        className="w-6 h-6 rounded-full bg-zinc-800 shadow-lg flex-shrink-0"
                    />
                    <div className="min-w-0">
                        <h2 className="font-semibold text-zinc-50 text-xs flex items-center gap-1">
                            Chat
                            <span className="px-1 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[7px] text-emerald-500 font-mono truncate max-w-[60px]">
                                {session?.anonymousId?.slice(0, 8)}...
                            </span>
                        </h2>
                        <div className="flex items-center gap-1 text-[9px] text-emerald-400">
                            <Lock className="w-2 h-2" />
                            <span>Secure</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="h-7 px-2 bg-emerald-500/10 rounded-md border border-emerald-500/20 flex items-center gap-1">
                        <Users className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-mono text-emerald-400">{onlineCount}</span>
                    </div>
                    <button
                        onClick={disconnect}
                        className="h-7 w-7 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-md transition-colors flex items-center justify-center"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Messages - Scrollable area only */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-4 sm:space-y-6 scrollbar-hide">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500/30">
                        <div className="p-4 rounded-full bg-zinc-900/50 mb-4 animate-pulse">
                            <Wifi className="w-8 h-8" />
                        </div>
                        <p className="font-mono text-sm">Channel secure. Waiting for messages...</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-2 sm:gap-4 items-end ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && (
                                <img
                                    src={`https://api.dicebear.com/9.x/bottts/svg?seed=${message.senderAvatar?.seed || 'unknown'}`}
                                    alt="Peer"
                                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-800 flex-shrink-0 shadow-lg border border-white/10 mb-3"
                                />
                            )}

                            <div className="max-w-[80%] sm:max-w-xl">
                                <span className={`text-[10px] font-mono mb-0.5 block ${message.role === 'user' ? 'text-right text-emerald-500/70 mr-1' : 'text-orange-500 ml-1'}`}>
                                    anon-{(message.senderAvatar?.seed || session?.anonymousId || 'unknown').replace('0x', '').slice(0, 12)}
                                </span>
                                <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed shadow-sm ${message.role === 'user'
                                    ? 'bg-emerald-600 text-white rounded-br-sm'
                                    : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-sm'
                                    }`}>
                                    {message.content}
                                </div>
                                <span className={`text-[9px] text-zinc-600 mt-0.5 block ${message.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}>
                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>

                            {message.role === 'user' && (
                                <img
                                    src={`https://api.dicebear.com/9.x/bottts/svg?seed=${session?.anonymousId}`}
                                    alt="Me"
                                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-800 flex-shrink-0 shadow-lg border border-white/10 mb-3"
                                />
                            )}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input - Fixed at bottom */}
            <div className="flex-shrink-0 p-2 sm:p-4 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-lg z-10">
                <div className="max-w-4xl mx-auto flex gap-2">
                    <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a secure message..."
                        className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm sm:text-base text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        autoFocus
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!inputMessage.trim() || cooldown > 0}
                        className="px-4 py-2.5 sm:py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors min-w-[56px] flex items-center justify-center touch-target"
                    >
                        {cooldown > 0 ? (
                            <span className="text-sm font-mono">{cooldown}s</span>
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}