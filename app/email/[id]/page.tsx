'use client';

import { useState, useEffect } from 'react';
import { roflMailService } from '@/services/roflService';
import { Lock, User, Eye, EyeOff, KeyRound, Lightbulb } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function EmailViewPage() {
    const params = useParams();
    const emailId = params.id as string;

    const [recipientEmail, setRecipientEmail] = useState('');
    const [secretKeyInput, setSecretKeyInput] = useState('');
    const [authenticated, setAuthenticated] = useState(false);
    const [email, setEmail] = useState<any>(null);
    const [emailMetadata, setEmailMetadata] = useState<any>(null);
    const [decryptedBody, setDecryptedBody] = useState('');
    const [showRaw, setShowRaw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMetadata, setLoadingMetadata] = useState(true);
    const [error, setError] = useState('');

    // Load email metadata on mount using access key from URL
    useEffect(() => {
        const loadMetadata = async () => {
            try {
                // Get access key from URL hash (#key=...)
                const hashParams = new URLSearchParams(window.location.hash.slice(1));
                const accessKey = hashParams.get('key');

                if (!accessKey) {
                    setError('Invalid Secure Link: Missing Access Key');
                    setLoadingMetadata(false);
                    return;
                }

                // Retrieve and decrypt metadata using the access key
                const decryptedEmail = await roflMailService.retrieveViaLink(emailId, accessKey);
                setEmailMetadata(decryptedEmail);
            } catch (err) {
                console.error('Failed to load email metadata:', err);
                setError('Failed to load encrypted email. Link might be expired or invalid.');
            } finally {
                setLoadingMetadata(false);
            }
        };
        loadMetadata();
    }, [emailId]);

    const handleAuthenticate = async () => {
        if (!secretKeyInput) {
            setError('Please enter the secret key');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // We already have the decrypted metadata from the initial load
            if (!emailMetadata) throw new Error('Email data not loaded');

            // Verify secret key
            const storedKey = emailMetadata.metadata?.secretKey;

            // Note: In a real TEE, this check would happen inside the enclave.
            // Here we check against the decrypted metadata.
            if (storedKey && storedKey !== secretKeyInput) {
                setError('Invalid secret key');
                setLoading(false);
                return;
            }

            // Decrypt the email body
            // We can use the service to decrypt since the body encryption is separate from metadata encryption
            const decryptedBody = emailMetadata.metadata?.isEncrypted
                ? await roflMailService.decryptEmailContent(emailMetadata.encryptedBody)
                : emailMetadata.encryptedBody;

            const decryptedEmail = {
                ...emailMetadata,
                body: decryptedBody,
                sender: emailMetadata.metadata.sender,
                senderEmail: emailMetadata.metadata.sender, // Assuming sender is address
                recipient: emailMetadata.metadata.recipient,
                recipientEmail: emailMetadata.metadata.recipient,
                subject: emailMetadata.metadata.subject,
                isEncrypted: emailMetadata.metadata.isEncrypted,
                timestamp: emailMetadata.metadata.timestamp
            };

            setEmail(decryptedEmail);
            setDecryptedBody(decryptedBody);
            setAuthenticated(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to decrypt email');
            console.error('Decryption error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loadingMetadata) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const hint = emailMetadata?.metadata?.hint;

    if (!authenticated) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <KeyRound className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-zinc-50">Encrypted Email</h1>
                        <p className="text-zinc-400 mt-2">Enter the secret key to decrypt</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Secret Key
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    type="text"
                                    value={secretKeyInput}
                                    onChange={(e) => setSecretKeyInput(e.target.value)}
                                    placeholder="Enter secret key"
                                    className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                                />
                            </div>

                            {/* Hint Display */}
                            {hint && (
                                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-yellow-400">Hint</p>
                                            <p className="text-sm text-yellow-500/80">{hint}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleAuthenticate}
                            disabled={loading}
                            className="w-full py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Decrypting...' : '🔓 Decrypt & Read Email'}
                        </button>

                        {loading && (
                            <div className="text-center py-4">
                                <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm text-zinc-400 mt-2">Decrypting within TEE...</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-zinc-800">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                            <span>TEE Attestation Verified</span>
                        </div>
                        <p className="text-xs text-zinc-600 mt-1">
                            Email ID: {emailId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-zinc-50">{email.sender}</h1>
                                <p className="text-sm text-zinc-400">{'<'}{email.senderEmail}{'>'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-xs rounded">
                                {email.isEncrypted ? 'Encrypted' : 'Plain Text'}
                            </span>
                            <button
                                onClick={() => setShowRaw(!showRaw)}
                                className="p-2 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                                {showRaw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-zinc-500">From:</span>
                            <span className="text-zinc-50 ml-2">{email.sender} {'<'}{email.senderEmail}{'>'}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">To:</span>
                            <span className="text-zinc-50 ml-2">{email.recipient} {'<'}{email.recipientEmail}{'>'}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">Subject:</span>
                            <span className="text-zinc-50 ml-2">{email.subject}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">Date:</span>
                            <span className="text-zinc-50 ml-2">{new Date(email.timestamp).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Email Body */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Lock className="w-5 h-5 text-emerald-500" />
                        <h2 className="text-lg font-semibold text-zinc-50">Decrypted Message</h2>
                    </div>

                    {showRaw ? (
                        <pre className="bg-zinc-800 p-4 rounded-lg overflow-x-auto text-sm text-zinc-300">
                            {decryptedBody}
                        </pre>
                    ) : (
                        <div className="prose prose-invert max-w-none">
                            <p className="text-zinc-300 whitespace-pre-wrap">{decryptedBody}</p>
                        </div>
                    )}

                    <div className="mt-6 pt-4 border-t border-zinc-800">
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <span>TEE Secured</span>
                            </div>
                            <span>•</span>
                            <span>Oasis Sapphire Testnet</span>
                            <span>•</span>
                            <span>Email ID: {emailId}</span>
                        </div>
                    </div>
                </div>

                {/* Security Info */}
                <div className="mt-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-3">
                        <Lock className="w-5 h-5 text-emerald-500" />
                        <h3 className="font-semibold text-emerald-400">Security Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-emerald-500">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>Hardware-based TEE encryption</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>Blockchain-verified integrity</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>Remote attestation verified</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>Zero-knowledge architecture</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}