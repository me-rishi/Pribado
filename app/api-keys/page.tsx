'use client';

import { useState, useEffect, useRef } from 'react';
import { vaultService, VaultSecret } from '@/services/vaultService';
import { getEnclaveKey, useAuth } from '@/contexts/AuthContext'; // Added useAuth
import { ethers } from 'ethers'; // Added ethers
import { RotationTimer } from '@/components/RotationTimer';
import {
    Eye,
    EyeOff,
    Copy,
    Key,
    Shield,
    Plus,
    Trash2,
    ShieldCheck,
    Lock,
    Server,
    Search,
    Rocket,
    X,
    Check,
    Loader2,
    LockOpen,
    KeyRound,
    Zap,
    ChevronRight,
    Globe,
    RefreshCw
} from 'lucide-react';

// Provider logo mapping
const PROVIDER_LOGOS: Record<string, string> = {
    deepseek: '/deepseek-ai-icon-seeklogo.png',
    google: '/Google_Favicon_2025.svg.png',
    groq: '/Groq-circle-logo-1.webp',
    openai: '/openai.jpg',
    openrouter: '/openrouter.png',
    anthropic: '/anthropic-1.svg',
    supabase: '/supabase.jpeg',
};

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google AI',
    deepseek: 'DeepSeek',
    groq: 'Groq',
    openrouter: 'OpenRouter',
    supabase: 'Supabase',
};

// All supported providers
const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'groq', 'openrouter', 'supabase'];

const getProviderLogo = (provider: string) => {
    const key = provider.toLowerCase();
    return PROVIDER_LOGOS[key] || null;
};

export default function PrivateApi() {
    const { getSeedPhrase } = useAuth(); // Get seed phrase access
    const [keys, setKeys] = useState<VaultSecret[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isVaultReady, setIsVaultReady] = useState(false);
    const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
    const [provisionedKeys, setProvisionedKeys] = useState<Set<string>>(new Set());
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [proxyIds, setProxyIds] = useState<Record<string, string>>({}); // Store calculated proxy IDs
    const [viewingKey, setViewingKey] = useState<VaultSecret | null>(null); // For Mobile Detail Modal



    // New Key Form State
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProvider, setNewProvider] = useState('');
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');

    // Toast state
    const [toast, setToast] = useState<{ show: boolean; key: string; copied: boolean; revoked?: boolean }>({ show: false, key: '', copied: false, revoked: false });

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; keyId: string; keyName: string; proxyId: string } | null>(null);

    // Provision modal state
    const [provisionModal, setProvisionModal] = useState<{ show: boolean; key: VaultSecret | null }>({ show: false, key: null });
    const [rotationInterval, setRotationInterval] = useState('none');
    const [webhookUrl, setWebhookUrl] = useState('');

    // Rotation intervals
    const ROTATION_OPTIONS = [
        { value: 'none', label: 'Never', ms: 0 },
        { value: '1min', label: 'Every 1 minute', ms: 60000 },
        { value: '5min', label: 'Every 5 minutes', ms: 300000 },
        { value: '15min', label: 'Every 15 minutes', ms: 900000 },
        { value: '30min', label: 'Every 30 minutes', ms: 1800000 },
        { value: '1h', label: 'Every 1 hour', ms: 3600000 },
        { value: '12h', label: 'Every 12 hours', ms: 43200000 },
        { value: '24h', label: 'Every 24 hours', ms: 86400000 },
        { value: '7d', label: 'Every 7 days', ms: 604800000 },
        { value: '30d', label: 'Every 30 days', ms: 2592000000 },
    ];

    // Rotation info for each key (targetTime is absolute timestamp)
    const [rotationInfo, setRotationInfo] = useState<Record<string, { interval: number; targetTime: number } | null>>({});

    // Helper component for live countdown



    useEffect(() => {
        const checkVault = async () => {
            const ready = vaultService.isInitialized();
            setIsVaultReady(ready);
            if (ready) {
                await loadKeys();
            } else {
                setIsLoading(false);
            }
        };
        checkVault();
    }, []);



    // Generate deterministic proxy ID using HMAC-SHA256 (SecretID + Wallet Private Key)
    const calculateProxyId = async (secretId: string, walletPrivateKey: string) => {
        const hmac = ethers.keccak256(ethers.toUtf8Bytes(secretId + walletPrivateKey));
        return `priv_${hmac.slice(2, 34)}`;
    };

    const loadKeys = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const allSecrets = await vaultService.getAllSecrets();
            const apiKeys = allSecrets.filter(s => s.type === 'api_key');
            setKeys(apiKeys);

            // Calculate Proxy IDs securely
            const seed = await getSeedPhrase();
            let idMap: Record<string, string> = {};

            if (seed) {
                try {
                    // Try as mnemonic first (BIP39)
                    let wallet: ethers.HDNodeWallet | ethers.Wallet;
                    if (ethers.Mnemonic.isValidMnemonic(seed.trim().toLowerCase())) {
                        const mnemonic = ethers.Mnemonic.fromPhrase(seed.trim().toLowerCase());
                        wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
                    } else {
                        // Fallback to private key if it looks like one
                        wallet = new ethers.Wallet(seed.startsWith('0x') ? seed : `0x${seed}`);
                    }

                    // Batch calculate all IDs
                    await Promise.all(apiKeys.map(async (k) => {
                        idMap[k.id] = await calculateProxyId(k.id, wallet.privateKey);
                    }));

                    if (!silent) setProxyIds(idMap);
                } catch (err) {
                    console.error('[API Keys] Failed to derive wallet from seed:', err);
                    if (!silent) setProxyIds({});
                }

                // Check provision status using calculate IDs
                if (apiKeys.length > 0) {
                    const pribadoKeys = Object.values(idMap);
                    const enclaveKey = await getEnclaveKey() || '';
                    const authData = sessionStorage.getItem('pribado_auth');
                    const owner = authData ? JSON.parse(authData).address : '';

                    const response = await fetch('/api/proxy/check', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-enclave-key': enclaveKey,
                            'x-enclave-owner': owner
                        },
                        body: JSON.stringify({ pribadoKeys })
                    });
                    const result = await response.json();

                    if (result.provisioned) {
                        const provisionedSecretIds = new Set<string>();
                        const rotationInfoMap: Record<string, { interval: number; targetTime: number } | null> = {};

                        // Process key updates from server (Lazy Rotation means server has newer keys)
                        if (result.keyUpdates) {
                            Object.entries(result.keyUpdates as Record<string, string>).forEach(([oldKey, newKey]) => {
                                // Find which secret used this oldKey
                                const secretId = Object.keys(idMap).find(id => idMap[id] === oldKey);
                                if (secretId) {
                                    idMap[secretId] = newKey; // Update to new key
                                }
                            });
                            setProxyIds({ ...idMap }); // Update state
                        }

                        // Map back using our (potentially updated) idMap
                        Object.entries(idMap).forEach(([secretId, pId]) => {
                            if (result.provisioned.includes(pId)) {
                                provisionedSecretIds.add(secretId);
                                if (result.rotationInfo && result.rotationInfo[pId]) {
                                    const info = result.rotationInfo[pId];
                                    rotationInfoMap[secretId] = {
                                        interval: info.interval,
                                        targetTime: Date.now() + info.expiresIn
                                    };
                                }
                            }
                        });

                        setProvisionedKeys(provisionedSecretIds);
                        setRotationInfo(rotationInfoMap);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load keys:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProvider || !newKeyValue) return;

        setIsSaving(true);
        const savedKeyName = newKeyName || newProvider; // Save before reset
        try {
            await vaultService.addSecret({
                name: savedKeyName,
                username: newProvider, // Storing provider in 'username' field
                password: newKeyValue, // Storing actual key in 'password' field
                type: 'api_key',
                notes: `Added on ${new Date().toLocaleDateString()}`
            });

            // Reset form
            setNewProvider('');
            setNewKeyName('');
            setNewKeyValue('');
            setShowAddForm(false);

            // Reload list and auto-open the new key
            await loadKeys();

            // Find the newly created key and open its modal
            const allSecrets = await vaultService.getAllSecrets();
            const newKey = allSecrets.find(s => s.type === 'api_key' && s.name === savedKeyName);
            if (newKey) {
                setViewingKey(newKey);
            }
        } catch (error) {
            console.error('Failed to save key:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKey = async (id: string) => {
        // Show confirmation modal instead of browser confirm
        const proxyId = await getProxyIdSecure(id);
        const key = keys.find(k => k.id === id);
        setDeleteConfirm({ show: true, keyId: id, keyName: key?.name || 'Unknown', proxyId });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm) return;

        // First revoke from proxy
        try {
            const enclaveKey = await getEnclaveKey() || '';
            const authData = sessionStorage.getItem('pribado_auth');
            const owner = authData ? JSON.parse(authData).address : '';

            await fetch('/api/proxy/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-enclave-key': enclaveKey,
                    'x-enclave-owner': owner
                },
                body: JSON.stringify({ pribadoKey: deleteConfirm.proxyId })
            });
            console.log(`[Revoke] Removed ${deleteConfirm.proxyId} from proxy`);
        } catch (e) {
            console.error('Failed to revoke from proxy:', e);
        }

        // Then delete from vault
        await vaultService.deleteSecret(deleteConfirm.keyId);
        await logKeyAccess('Key Deleted', deleteConfirm.keyName, deleteConfirm.proxyId);

        setProvisionedKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(deleteConfirm.keyId);
            return newSet;
        });
        setDeleteConfirm(null);
        await loadKeys();
    };



    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleProvision = async (key: VaultSecret) => {
        // Show provision modal instead of directly provisioning
        setProvisionModal({ show: true, key });
        setRotationInterval('none');
        setWebhookUrl('');
    };

    const handleDeactivate = async () => {
        if (!provisionModal.key) return;
        setIsProvisioning(true);
        try {
            const key = provisionModal.key;
            const proxyId = await getProxyIdSecure(key.id);
            const enclaveKey = await getEnclaveKey() || '';
            const authData = sessionStorage.getItem('pribado_auth');
            const owner = authData ? JSON.parse(authData).address : '';

            const response = await fetch('/api/proxy/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-enclave-key': enclaveKey,
                    'x-enclave-owner': owner
                },
                body: JSON.stringify({ pribadoKey: proxyId })
            });

            if (response.ok) {
                setProvisionedKeys(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key.id);
                    return newSet;
                });
                setRotationInfo(prev => {
                    const newInfo = { ...prev };
                    delete newInfo[key.id];
                    return newInfo;
                });
                setProvisionModal({ show: false, key: null });
                setToast({ show: true, key: key.id, copied: false, revoked: true });
                setTimeout(() => setToast({ show: false, key: '', copied: false, revoked: false }), 2000);
            }
        } catch (error) {
            console.error('Failed to deactivate:', error);
            alert('Failed to deactivate key');
        } finally {
            setIsProvisioning(false);
        }
    };

    const confirmProvision = async () => {
        if (!provisionModal.key) return;

        setIsProvisioning(true);
        const key = provisionModal.key;
        try {
            const proxyId = await getProxyIdSecure(key.id);
            const rotationMs = ROTATION_OPTIONS.find(o => o.value === rotationInterval)?.ms || 0;
            const enclaveKey = await getEnclaveKey() || '';
            const authData = sessionStorage.getItem('pribado_auth');
            const owner = authData ? JSON.parse(authData).address : '';

            const response = await fetch('/api/proxy/provision', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-enclave-key': enclaveKey,
                    'x-enclave-owner': owner
                },
                body: JSON.stringify({
                    pribadoKey: proxyId,
                    realKey: key.password,
                    provider: key.username,
                    rotationInterval: rotationMs,
                    webhookUrl
                })
            });
            const result = await response.json();

            if (result.success) {
                setProvisionedKeys(prev => {
                    const newSet = new Set(prev);
                    newSet.add(key.id);
                    return newSet;
                });
                // Set rotation info immediately so badge shows
                if (rotationMs > 0) {
                    setRotationInfo(prev => ({
                        ...prev,
                        [key.id]: {
                            interval: rotationMs,
                            targetTime: Date.now() + rotationMs
                        }
                    }));
                }
                setProvisionModal({ show: false, key: null });
                setProvisionModal({ show: false, key: null });
                // Show toast instead of alert
                setToast({ show: true, key: proxyId, copied: false });
                logKeyAccess('Key Provisioned', key.name, proxyId);
                // Auto-hide after 10 seconds
                setTimeout(() => setToast({ show: false, key: '', copied: false }), 10000);
            } else {
                alert('Failed to provision: ' + result.error);
            }
        } catch (e) {
            console.error(e);
            alert('Provisioning failed');
        } finally {
            setIsProvisioning(false);
        }
    };

    // Synchronous helper for render (reads from state)
    const getProxyId = (secretId: string) => {
        return proxyIds[secretId] || 'Loading...';
    };

    // Async helper for handlers (ensures value exists)
    const getProxyIdSecure = async (secretId: string) => {
        // Return cached if available
        if (proxyIds[secretId]) return proxyIds[secretId];

        // Calculate if missing
        const seed = await getSeedPhrase();
        if (seed) {
            const wallet = ethers.Wallet.fromPhrase(seed);
            return calculateProxyId(secretId, wallet.privateKey);
        }
        throw new Error('Wallet not initialized');
    };

    // Audit Logging Helper
    const logKeyAccess = async (event: string, keyName: string, proxyId?: string) => {
        try {
            const authData = sessionStorage.getItem('pribado_auth');
            const owner = authData ? JSON.parse(authData).address : '';

            // Mask proxyId for audit log security (show first 12 + last 4 chars)
            const maskedProxyId = proxyId && proxyId.length >= 16
                ? proxyId.substring(0, 12) + '...' + proxyId.slice(-4)
                : 'priv_***';

            await fetch('/api/audit-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-enclave-owner': owner
                },
                body: JSON.stringify({
                    event,
                    details: { keyName, proxyId: maskedProxyId }
                })
            });
        } catch (e) {
            console.error('Failed to log access:', e);
        }
    };

    const toggleKeyVisibility = (id: string, name: string) => {
        setRevealedKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
                // Log reveal
                logKeyAccess('Key Revealed', name, getProxyId(id));
            }
            return newSet;
        });
    };

    const maskSecret = () => {
        return '••••••••••••••••';
    };

    if (!isVaultReady) {
        return (
            <div className="h-full flex flex-col items-center justify-center animate-fade-in p-6">
                <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 border border-zinc-800">
                    <Lock className="w-8 h-8 text-zinc-500" />
                </div>
                <h2 className="text-xl font-bold text-zinc-50 mb-2">Vault Locked</h2>
                <p className="text-zinc-400 text-center max-w-md mb-8">
                    Your Private API Keys are stored in your secure vault.
                    Please unlock your vault to manage credentials.
                </p>
                <a
                    href="/vault"
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all"
                >
                    Unlock Vault
                </a>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden p-3 sm:p-4 space-y-3 animate-fade-in">
            {/* Header */}
            <div className="flex-none">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-50">Private API Gateway</h1>
                <p className="text-zinc-400 text-xs">
                    Securely manage and proxy your AI & Service keys
                </p>

                {/* Tech Stack Banners - Edge-to-Edge Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4 pb-2 w-full">
                    {/* Account Stats */}
                    <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <KeyRound className="w-3 h-3 text-orange-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-orange-400 truncate">Total Keys</p>
                            <p className="text-[8px] text-orange-500 truncate">{keys.length} stored</p>
                        </div>
                    </div>

                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-emerald-400 truncate">Active</p>
                            <p className="text-[8px] text-emerald-500 truncate">{provisionedKeys.size} active</p>
                        </div>
                    </div>

                    {/* Tech Stack */}
                    <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <Server className="w-3 h-3 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-blue-400 truncate">Network</p>
                            <p className="text-[8px] text-blue-500 truncate">Sapphire</p>
                        </div>
                    </div>

                    <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-3 h-3 text-purple-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-purple-400 truncate">Hardware</p>
                            <p className="text-[8px] text-purple-500 truncate">Intel SGX</p>
                        </div>
                    </div>

                    <div className="p-2 bg-pink-500/10 border border-pink-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <Lock className="w-3 h-3 text-pink-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-pink-400 truncate">Encryption</p>
                            <p className="text-[8px] text-pink-500 truncate">AES-GCM</p>
                        </div>
                    </div>

                    <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center gap-2 min-w-0">
                        <Key className="w-3 h-3 text-cyan-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-medium text-cyan-400 truncate">Identity</p>
                            <p className="text-[8px] text-cyan-500 truncate">HMAC</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto sm:pr-2 space-y-3 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">

                {/* Actions Row - Responsive & Compact */}
                <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 w-full transition-all touch-target"
                        />
                    </div>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 touch-target shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Key</span>
                    </button>
                </div>

                {/* Add Key Form Modal (Inline for now) */}
                {showAddForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 overflow-hidden">
                            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
                                <h3 className="font-bold text-zinc-50">Add New Key</h3>
                                <button onClick={() => setShowAddForm(false)} className="text-zinc-500 hover:text-zinc-300">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <form onSubmit={handleAddKey} className="p-4 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
                                    <div className="relative">
                                        <select
                                            value={newProvider}
                                            onChange={e => setNewProvider(e.target.value)}
                                            className="w-full px-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
                                        >
                                            <option value="">Select a provider...</option>
                                            {SUPPORTED_PROVIDERS.map(p => (
                                                <option key={p} value={p}>
                                                    {PROVIDER_NAMES[p] || p}
                                                </option>
                                            ))}
                                        </select>
                                        {/* Logo on left */}
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                                            {getProviderLogo(newProvider) ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={getProviderLogo(newProvider)!} alt="" className="w-4 h-4 object-contain" />
                                            ) : (
                                                <Key className="w-4 h-4 text-zinc-500" />
                                            )}
                                        </div>
                                        {/* Chevron on right */}
                                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 rotate-90" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Label</label>
                                    <input
                                        type="text"
                                        value={newKeyName}
                                        onChange={e => setNewKeyName(e.target.value)}
                                        placeholder="Production/Development"
                                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">API Key</label>
                                    <input
                                        type="password"
                                        value={newKeyValue}
                                        onChange={e => setNewKeyValue(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 font-mono"
                                    />
                                </div>
                                <div className="pt-2 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddForm(false)}
                                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving || !newProvider || !newKeyValue}
                                        className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Secure Save
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Provision Modal */}
                {provisionModal.show && provisionModal.key && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 overflow-hidden">
                            <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
                                <h3 className="font-bold text-zinc-50">
                                    {provisionedKeys.has(provisionModal.key.id) ? 'Manage Proxy Activation' : 'Activate in Proxy'}
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1">
                                    {provisionedKeys.has(provisionModal.key.id)
                                        ? <span>This key is currently <b>active</b> in the SGX Enclave.</span>
                                        : <span>This will securely load <b>{provisionModal.key.name}</b> into the SGX Enclave.</span>
                                    }
                                </p>
                            </div>
                            <div className="p-4 space-y-4">
                                {!provisionedKeys.has(provisionModal.key.id) && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Auto-Rotation (Optional)</label>
                                            <select
                                                value={rotationInterval}
                                                onChange={(e) => setRotationInterval(e.target.value)}
                                                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50"
                                            >
                                                {ROTATION_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {rotationInterval !== 'none' && (
                                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                                <p className="text-[10px] text-yellow-500 leading-relaxed">
                                                    ℹ️ Rotation requires you to add a Webhook URL that accepts the new key.
                                                </p>
                                                <input
                                                    type="text"
                                                    placeholder="https://api.myapp.com/rotate-key"
                                                    value={webhookUrl}
                                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                                    className="mt-2 w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="pt-2 flex gap-2">
                                    <button
                                        onClick={() => setProvisionModal({ show: false, key: null })}
                                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                                    >
                                        Cancel
                                    </button>

                                    {provisionedKeys.has(provisionModal.key.id) ? (
                                        <button
                                            onClick={handleDeactivate}
                                            disabled={isProvisioning}
                                            className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isProvisioning && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Deactivate
                                        </button>
                                    ) : (
                                        <button
                                            onClick={confirmProvision}
                                            disabled={isProvisioning}
                                            className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isProvisioning && <Loader2 className="w-3 h-3 animate-spin" />}
                                            Activate
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation */}
                {deleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-zinc-900 border border-red-900/50 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                            <div className="p-4">
                                <h3 className="font-bold text-red-500 mb-2">Delete Key?</h3>
                                <p className="text-sm text-zinc-300">
                                    Are you sure you want to delete <b>{deleteConfirm.keyName}</b>?
                                </p>
                                <p className="text-xs text-zinc-500 mt-2">
                                    This will permanently remove it from your vault and revoke proxy access.
                                </p>
                                <div className="mt-6 flex gap-2">
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold"
                                    >
                                        Delete Forever
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Keys Table - Matches Vault Layout */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    {keys.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <div className="w-16 h-16 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex items-center justify-center mb-4">
                                <Key className="w-8 h-8 text-zinc-700" />
                            </div>
                            <h3 className="text-zinc-300 font-medium mb-1">No API Keys</h3>
                            <p className="text-zinc-500 text-xs max-w-[200px]">
                                Add your provider keys to start using the TEE capabilities.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-zinc-950/50 border-b border-zinc-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Key Details</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Real Key</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Proxy ID</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50">
                                        {keys.map((key) => (
                                            <tr key={key.id} className="hover:bg-zinc-800/30 transition-colors group">
                                                {/* Name Col */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center border border-zinc-800 overflow-hidden">
                                                            {getProviderLogo(key.username) ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={getProviderLogo(key.username)!}
                                                                    alt={key.username}
                                                                    className="w-5 h-5 object-contain"
                                                                />
                                                            ) : (
                                                                <span className="text-zinc-400 font-bold text-xs">
                                                                    {key.username.substring(0, 1).toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-zinc-200 text-sm">{key.name}</div>
                                                            <div className="text-[10px] text-zinc-500">{key.username}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Secret Col */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 bg-zinc-950/50 p-1.5 rounded border border-zinc-800/50 w-[180px]">
                                                        <Key className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                                        <code className="text-xs text-zinc-300 font-mono truncate flex-1">
                                                            {revealedKeys.has(key.id) ? key.password : maskSecret()}
                                                        </code>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                onClick={() => toggleKeyVisibility(key.id, key.name)}
                                                                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                                                title={revealedKeys.has(key.id) ? "Hide" : "Show"}
                                                            >
                                                                {revealedKeys.has(key.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    copyToClipboard(key.password);
                                                                    setToast({ show: true, key: key.id, copied: true });
                                                                    logKeyAccess('Key Copied', key.name);
                                                                    setTimeout(() => setToast({ show: false, key: '', copied: false }), 2000);
                                                                }}
                                                                className="p-1 text-zinc-500 hover:text-emerald-500 transition-colors"
                                                                title="Copy Secret"
                                                            >
                                                                {toast.show && toast.key === key.id && toast.copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Proxy Col */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className={`flex items-center gap-2 p-1.5 rounded border w-[180px] ${provisionedKeys.has(key.id) ? 'bg-blue-500/10 border-blue-500/20' : 'bg-zinc-800/30 border-zinc-700/30 opacity-60'}`}>
                                                        <Shield className={`w-3 h-3 flex-shrink-0 ${provisionedKeys.has(key.id) ? 'text-blue-500' : 'text-zinc-600'}`} />
                                                        <code className={`font-mono text-xs truncate flex-1 ${provisionedKeys.has(key.id) ? 'text-blue-100' : 'text-zinc-500'}`}>
                                                            {getProxyId(key.id)}
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                const pid = getProxyId(key.id);
                                                                copyToClipboard(pid);
                                                                setToast({ show: true, key: pid, copied: true });
                                                                setTimeout(() => setToast({ show: false, key: '', copied: false }), 2000);
                                                            }}
                                                            disabled={!provisionedKeys.has(key.id)}
                                                            className={`p-1 shrink-0 ${provisionedKeys.has(key.id) ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-600 cursor-not-allowed'}`}
                                                        >
                                                            {toast.show && toast.key === getProxyId(key.id) && toast.copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Status Col */}
                                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                                    <div className="flex flex-col items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleProvision(key)}
                                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${provisionedKeys.has(key.id)
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                                                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                                                                }`}
                                                        >
                                                            {provisionedKeys.has(key.id) ? (
                                                                <>
                                                                    <Lock className="w-3 h-3" /> Active
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <LockOpen className="w-3 h-3" /> Idle
                                                                </>
                                                            )}
                                                        </button>

                                                        {provisionedKeys.has(key.id) && (
                                                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                                                                {rotationInfo[key.id]?.targetTime ? (
                                                                    <RotationTimer
                                                                        targetTime={rotationInfo[key.id]!.targetTime}
                                                                        interval={rotationInfo[key.id]!.interval}
                                                                        onLoop={() => loadKeys(true)}
                                                                    />
                                                                ) : 'Manual Rotate'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions Col */}
                                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleDeleteKey(key.id)}
                                                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                                                            title="Delete Key"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile List View */}
                            <div className="md:hidden divide-y divide-zinc-800">
                                {keys.map((key) => (
                                    <button
                                        key={key.id}
                                        onClick={() => setViewingKey(key)}
                                        className="w-full p-4 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left group"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-zinc-950 flex items-center justify-center border border-zinc-800 overflow-hidden">
                                            {getProviderLogo(key.username) ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={getProviderLogo(key.username)!}
                                                    alt={key.username}
                                                    className="w-6 h-6 object-contain"
                                                />
                                            ) : (
                                                <span className="text-zinc-400 font-bold text-sm">
                                                    {key.username.substring(0, 1).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 flex items-center justify-between">
                                            <div className="min-w-0 max-w-[140px]">
                                                <h3 className="text-sm font-bold text-zinc-200 truncate">{key.name}</h3>
                                                <p className="text-xs text-zinc-500 truncate">{key.username}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                {provisionedKeys.has(key.id) && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        Active
                                                    </span>
                                                )}
                                                {provisionedKeys.has(key.id) && rotationInfo[key.id]?.targetTime && (
                                                    <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                                                        <RotationTimer
                                                            targetTime={rotationInfo[key.id]!.targetTime}
                                                            interval={rotationInfo[key.id]!.interval}
                                                            onLoop={() => loadKeys(true)}
                                                        />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Mobile Detail Modal */}
                {viewingKey && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-700 shadow-inner overflow-hidden">
                                        {getProviderLogo(viewingKey.username) ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={getProviderLogo(viewingKey.username)!}
                                                alt={viewingKey.username}
                                                className="w-6 h-6 object-contain"
                                            />
                                        ) : (
                                            <span className="text-zinc-400 font-bold text-sm">
                                                {viewingKey.username.substring(0, 1).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-zinc-50">{viewingKey.name}</h3>
                                        <p className="text-xs text-zinc-500">{viewingKey.username}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setViewingKey(null)}
                                    className="p-1 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-4 space-y-4">
                                {/* Real Key Section */}
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Real Provider Key</label>
                                    <div className="flex items-center gap-2 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <code className="text-xs text-zinc-300 font-mono truncate flex-1">
                                            {revealedKeys.has(viewingKey.id) ? viewingKey.password : maskSecret()}
                                        </code>
                                        <button
                                            onClick={() => toggleKeyVisibility(viewingKey.id, viewingKey.name)}
                                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                                        >
                                            {revealedKeys.has(viewingKey.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                copyToClipboard(viewingKey.password);
                                                setToast({ show: true, key: viewingKey.id, copied: true });
                                                setTimeout(() => setToast({ show: false, key: '', copied: false }), 2000);
                                            }}
                                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                                        >
                                            {toast.show && toast.key === viewingKey.id && toast.copied ? (
                                                <Check className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Proxy Key Section */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Proxy ID (Public)</label>
                                        <button
                                            onClick={() => {
                                                setViewingKey(null);
                                                handleProvision(viewingKey);
                                            }}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${provisionedKeys.has(viewingKey.id)
                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                                                : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
                                                }`}
                                        >
                                            {provisionedKeys.has(viewingKey.id) ? (
                                                <>
                                                    <ShieldCheck className="w-3 h-3 animate-pulse" /> Active
                                                </>
                                            ) : (
                                                <>
                                                    <Lock className="w-3 h-3 animate-pulse" /> Idle
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <code className="text-xs text-zinc-300 font-mono truncate flex-1">
                                            {getProxyId(viewingKey.id).slice(0, 16)}...
                                        </code>
                                        <button
                                            onClick={async () => {
                                                if (provisionedKeys.has(viewingKey.id)) {
                                                    const pid = await getProxyIdSecure(viewingKey.id);
                                                    copyToClipboard(pid);
                                                    setToast({ show: true, key: 'proxy-' + viewingKey.id, copied: true });
                                                    setTimeout(() => setToast({ show: false, key: '', copied: false }), 2000);
                                                }
                                            }}
                                            disabled={!provisionedKeys.has(viewingKey.id)}
                                            className={`p-1.5 rounded transition-colors ${provisionedKeys.has(viewingKey.id)
                                                ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                : 'text-zinc-700 cursor-not-allowed'
                                                }`}
                                        >
                                            {toast.show && toast.key === 'proxy-' + viewingKey.id && toast.copied ? (
                                                <Check className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Rotation Info (If Active) */}
                                {provisionedKeys.has(viewingKey.id) && rotationInfo[viewingKey.id] && (
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin-slow" />
                                            <span className="text-xs font-medium text-emerald-400">Auto-Rotation Active</span>
                                        </div>
                                        <RotationTimer
                                            targetTime={rotationInfo[viewingKey.id]!.targetTime}
                                            interval={rotationInfo[viewingKey.id]!.interval}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 flex gap-3">
                                <button
                                    onClick={() => {
                                        setViewingKey(null);
                                        handleProvision(viewingKey);
                                    }}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${provisionedKeys.has(viewingKey.id)
                                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                        }`}
                                >
                                    {provisionedKeys.has(viewingKey.id) ? (
                                        <>Manage</>
                                    ) : (
                                        <>Activate</>
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setViewingKey(null);
                                        handleDeleteKey(viewingKey.id);
                                    }}
                                    className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Floating Toast Notification (Centered) */}
                {toast.show && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                        <div className="animate-in zoom-in-95 fade-in duration-300 pointer-events-auto">
                            <div className="bg-zinc-900 border border-emerald-500/30 text-zinc-100 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 min-w-[300px]">
                                <div className="bg-emerald-500/20 p-2 rounded-full">
                                    <Check className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-emerald-400">Success</p>
                                    <p className="text-xs text-zinc-400">
                                        {toast.copied ? 'Copied to clipboard!' : toast.revoked ? 'Key has been deprovisioned' : 'Key provisioned successfully!'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setToast({ show: false, key: '', copied: false })}
                                    className="ml-2 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}