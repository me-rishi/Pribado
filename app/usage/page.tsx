'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
    ArrowLeft,
    Key,
    Plus,
    Copy,
    Check,
    Trash2,
    BarChart3,
    DollarSign,
    Activity,
    Clock,
    AlertCircle
} from 'lucide-react';

interface ServiceToken {
    id: string;
    name: string;
    prefix: string;
    createdAt: number;
    expiresAt: number | null;
    lastUsedAt: number | null;
    totalCalls: number;
    totalCostUsd: number;
    isActive: boolean;
}

interface UsageSummary {
    totalCalls: number;
    totalCostUsd: number;
    byEndpoint: Record<string, { calls: number; costUsd: number }>;
}

interface Pricing {
    'derive-key': number;
    'proxy': number;
    'vault-retrieve': number;
    'default': number;
}

export default function UsagePage() {
    const { user } = useAuth();
    const [tokens, setTokens] = useState<ServiceToken[]>([]);
    const [usage, setUsage] = useState<UsageSummary | null>(null);
    const [pricing, setPricing] = useState<Pricing | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create token modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [newTokenExpiry, setNewTokenExpiry] = useState<string>('');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Fetch tokens and usage
    useEffect(() => {
        if (user?.address) {
            fetchData();
        }
    }, [user?.address]);

    async function fetchData() {
        try {
            setLoading(true);
            const response = await fetch('/api/service-tokens', {
                headers: {
                    'x-wallet-address': user!.address
                }
            });

            if (!response.ok) throw new Error('Failed to fetch data');

            const data = await response.json();
            setTokens(data.tokens || []);
            setUsage(data.usage || null);
            setPricing(data.pricing?.rates || null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }

    async function createToken() {
        try {
            const response = await fetch('/api/service-tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-wallet-address': user!.address
                },
                body: JSON.stringify({
                    name: newTokenName,
                    expiresInDays: newTokenExpiry ? parseInt(newTokenExpiry) : null
                })
            });

            if (!response.ok) throw new Error('Failed to create token');

            const data = await response.json();
            setCreatedToken(data.token);
            setNewTokenName('');
            setNewTokenExpiry('');
            fetchData();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    async function revokeToken(tokenId: string) {
        if (!confirm('Are you sure you want to revoke this token?')) return;

        try {
            const response = await fetch('/api/service-tokens', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-wallet-address': user!.address
                },
                body: JSON.stringify({ tokenId, action: 'revoke' })
            });

            if (!response.ok) throw new Error('Failed to revoke token');

            fetchData();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    function copyToken() {
        if (createdToken) {
            navigator.clipboard.writeText(createdToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-zinc-400 mb-4">Connect your wallet to access usage dashboard</p>
                    <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
                        Go to Login →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/overview" className="text-zinc-400 hover:text-zinc-200">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-xl font-bold">API Usage Dashboard</h1>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Token
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-8">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Usage Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Activity className="w-5 h-5 text-emerald-400" />
                                    <span className="text-zinc-400">Total API Calls</span>
                                </div>
                                <p className="text-3xl font-bold">{usage?.totalCalls || 0}</p>
                            </div>

                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <DollarSign className="w-5 h-5 text-yellow-400" />
                                    <span className="text-zinc-400">Total Cost</span>
                                </div>
                                <p className="text-3xl font-bold">${(usage?.totalCostUsd || 0).toFixed(4)}</p>
                            </div>

                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Key className="w-5 h-5 text-blue-400" />
                                    <span className="text-zinc-400">Active Tokens</span>
                                </div>
                                <p className="text-3xl font-bold">{tokens.filter(t => t.isActive).length}</p>
                            </div>
                        </div>

                        {/* Pricing Info */}
                        {pricing && (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-emerald-400" />
                                    Pay-As-You-Go Pricing
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-zinc-800/50 rounded-lg p-4">
                                        <p className="text-sm text-zinc-400">derive-key</p>
                                        <p className="text-xl font-bold text-emerald-400">${pricing['derive-key']}/call</p>
                                    </div>
                                    <div className="bg-zinc-800/50 rounded-lg p-4">
                                        <p className="text-sm text-zinc-400">proxy</p>
                                        <p className="text-xl font-bold text-emerald-400">${pricing['proxy']}/call</p>
                                    </div>
                                    <div className="bg-zinc-800/50 rounded-lg p-4">
                                        <p className="text-sm text-zinc-400">vault-retrieve</p>
                                        <p className="text-xl font-bold text-emerald-400">${pricing['vault-retrieve']}/call</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tokens List */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Key className="w-5 h-5 text-emerald-400" />
                                Service Tokens
                            </h2>

                            {tokens.length === 0 ? (
                                <div className="text-center py-8 text-zinc-400">
                                    <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No service tokens yet</p>
                                    <p className="text-sm">Create a token to start using the API</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tokens.map(token => (
                                        <div
                                            key={token.id}
                                            className={`bg-zinc-800/50 rounded-lg p-4 flex items-center justify-between ${!token.isActive ? 'opacity-50' : ''
                                                }`}
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-medium">{token.name}</span>
                                                    <code className="text-sm text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                                                        {token.prefix}
                                                    </code>
                                                    {!token.isActive && (
                                                        <span className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">
                                                            Revoked
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
                                                    <span className="flex items-center gap-1">
                                                        <Activity className="w-4 h-4" />
                                                        {token.totalCalls} calls
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign className="w-4 h-4" />
                                                        ${token.totalCostUsd.toFixed(4)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-4 h-4" />
                                                        {token.lastUsedAt
                                                            ? new Date(token.lastUsedAt).toLocaleDateString()
                                                            : 'Never used'
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                            {token.isActive && (
                                                <button
                                                    onClick={() => revokeToken(token.id)}
                                                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                    title="Revoke token"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Create Token Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full mx-4">
                        {createdToken ? (
                            <>
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <Check className="w-5 h-5 text-emerald-400" />
                                    Token Created!
                                </h2>
                                <div className="bg-zinc-800 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-zinc-400 mb-2">
                                        Save this token - it will only be shown once!
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 text-sm text-emerald-400 break-all">
                                            {createdToken}
                                        </code>
                                        <button
                                            onClick={copyToken}
                                            className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                                        >
                                            {copied ? (
                                                <Check className="w-5 h-5 text-emerald-400" />
                                            ) : (
                                                <Copy className="w-5 h-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                                        <p className="text-sm text-yellow-200">
                                            Store this token securely. You won't be able to see it again!
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setCreatedToken(null);
                                    }}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                                >
                                    Done
                                </button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-bold mb-4">Create Service Token</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-2">Token Name</label>
                                        <input
                                            type="text"
                                            value={newTokenName}
                                            onChange={(e) => setNewTokenName(e.target.value)}
                                            placeholder="e.g., n8n-production"
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-emerald-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-2">Expires In (days, optional)</label>
                                        <input
                                            type="number"
                                            value={newTokenExpiry}
                                            onChange={(e) => setNewTokenExpiry(e.target.value)}
                                            placeholder="Leave empty for no expiry"
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-emerald-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={createToken}
                                        disabled={!newTokenName}
                                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                    >
                                        Create Token
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Error Toast */}
            {error && (
                <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 font-bold">×</button>
                </div>
            )}
        </div>
    );
}
