'use client';

import { useState, useEffect, useRef } from 'react';
import { vaultService, VaultSecret } from '@/services/vaultService';
import { useNetwork } from '@/contexts/NetworkContext';
import {
    Search,
    Copy,
    Eye,
    EyeOff,
    KeyRound,
    Plus,
    Edit,
    Trash2,
    X,
    Check,
    RefreshCw,
    Shield,
    Lock,
    Cloud,
    CloudOff,
    Download,
    Upload,
    Loader2,
    ExternalLink,
    CheckCircle,
    AlertCircle,
    ChevronRight,
    Globe
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

const getProviderLogo = (provider: string) => {
    const key = provider.toLowerCase();
    // Direct match
    if (PROVIDER_LOGOS[key]) return PROVIDER_LOGOS[key];
    // Partial match (e.g. 'google-cloud' -> 'google')
    const match = Object.keys(PROVIDER_LOGOS).find(k => key.includes(k));
    return match ? PROVIDER_LOGOS[match] : null;
};

interface Toast {
    show: boolean;
    type: 'success' | 'error' | 'confirm';
    title: string;
    message: string;
    explorerUrl?: string;
    confirmAction?: () => void;
}

export default function PrivateVault() {
    const { network } = useNetwork();
    const [secrets, setSecrets] = useState<VaultSecret[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingSecret, setEditingSecret] = useState<VaultSecret | null>(null);
    const [viewingSecret, setViewingSecret] = useState<VaultSecret | null>(null); // For Mobile Detail Modal
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [backingUp, setBackingUp] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [backupResult, setBackupResult] = useState<{ txHash: string; explorerUrl: string; rawData: string } | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const [toast, setToast] = useState<Toast>({
        show: false,
        type: 'success',
        title: '',
        message: '',
    });

    // Form state
    const [formName, setFormName] = useState('');
    const [formUsername, setFormUsername] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [lastTxNetwork, setLastTxNetwork] = useState<'testnet' | 'mainnet'>('testnet');

    // Load secrets on mount
    useEffect(() => {
        loadSecrets();
    }, []);

    const loadSecrets = async () => {
        setLoading(true);
        try {
            if (!vaultService.isInitialized()) {
                console.log('Vault not initialized, waiting...');
                // Wait a bit for vault to initialize from AuthContext
                await new Promise(resolve => setTimeout(resolve, 500));

                // If still not initialized, bail out
                if (!vaultService.isInitialized()) {
                    console.log('Vault still not initialized, skipping load');
                    setLoading(false);
                    return;
                }
            }
            const allSecrets = await vaultService.getAllSecrets();
            setSecrets(allSecrets);
            setLastTxHash(vaultService.getLastSyncTx());
            setLastTxNetwork(vaultService.getLastSyncNetwork());
        } catch (error) {
            console.error('Failed to load secrets:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredSecrets = secrets.filter(secret =>
        secret.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        secret.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        secret.url?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const togglePasswordVisibility = (id: string) => {
        setRevealedPasswords(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const maskPassword = (password: string) => {
        return '•'.repeat(Math.min(password.length, 20));
    };

    const generatePassword = () => {
        const newPassword = vaultService.generateSecurePassword(24);
        setFormPassword(newPassword);
    };

    const resetForm = () => {
        setFormName('');
        setFormUsername('');
        setFormPassword('');
        setFormUrl('');
        setFormNotes('');
        setEditingSecret(null);
    };

    const openAddModal = () => {
        resetForm();
        setShowAddModal(true);
    };

    const openEditModal = (secret: VaultSecret) => {
        setFormName(secret.name);
        setFormUsername(secret.username);
        setFormPassword(secret.password);
        setFormUrl(secret.url || '');
        setFormNotes(secret.notes || '');
        setEditingSecret(secret);
        setShowAddModal(true);
    };

    const handleSaveSecret = async () => {
        if (!formName || !formPassword) return;

        try {
            // Vault should already be initialized by AuthContext
            if (!vaultService.isInitialized()) {
                console.error('Vault not initialized');
                alert('Vault not initialized. Please logout and login again.');
                return;
            }

            if (editingSecret) {
                // Update existing
                await vaultService.updateSecret(editingSecret.id, {
                    name: formName,
                    username: formUsername,
                    password: formPassword,
                    url: formUrl || undefined,
                    notes: formNotes || undefined,
                });
            } else {
                // Add new
                await vaultService.addSecret({
                    name: formName,
                    username: formUsername,
                    password: formPassword,
                    url: formUrl || undefined,
                    notes: formNotes || undefined,
                });
            }

            await loadSecrets();
            setShowAddModal(false);
            resetForm();
        } catch (error) {
            console.error('Failed to save secret:', error);
            alert('Failed to save secret. Please try again.');
        }
    };

    const handleDeleteSecret = async (id: string) => {
        // Show confirmation toast
        setToast({
            show: true,
            type: 'confirm',
            title: 'Delete Secret?',
            message: 'Are you sure you want to delete this secret? This cannot be undone.',
            confirmAction: async () => {
                try {
                    await vaultService.deleteSecret(id);
                    await loadSecrets();
                    setToast({ show: true, type: 'success', title: 'Deleted', message: 'Secret has been deleted' });
                    setTimeout(() => setToast({ ...toast, show: false }), 2000);
                } catch (error) {
                    console.error('Failed to delete secret:', error);
                    setToast({ show: true, type: 'error', title: 'Error', message: 'Failed to delete secret' });
                }
            }
        });
    };

    // Sync to blockchain
    const handleSyncToChain = async () => {
        setBackingUp(true);
        setSyncStatus(null);
        try {
            const result = await vaultService.syncToChain();

            // Save txHash and network for "Last TXN" link
            setLastTxHash(result.txHash);
            setLastTxNetwork(localStorage.getItem('pribado_network') === 'mainnet' ? 'mainnet' : 'testnet');

            setBackupResult({
                txHash: result.txHash,
                explorerUrl: result.explorerUrl,
                rawData: result.rawData,
            });
            setToast({
                show: true,
                type: 'success',
                title: 'Backup Successful!',
                message: `Your vault has been encrypted and stored on Sapphire.`,
                explorerUrl: result.explorerUrl,
            });
            // Auto-hide toast after 5 seconds (was 3)
            setTimeout(() => setToast(prev => ({ ...prev, show: false })), 5000);
            // Auto-hide backup result after 10 seconds (was 5)
            setTimeout(() => setBackupResult(null), 10000);
        } catch (error) {
            console.error('Sync failed:', error);
            setToast({
                show: true,
                type: 'error',
                title: 'Sync Failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setBackingUp(false);
        }
    };

    // Restore from blockchain (auto-discovers by address)
    const handleSyncFromChain = async () => {
        setRestoring(true);
        setSyncStatus(null);
        try {
            const result = await vaultService.syncFromChain();
            await loadSecrets();
            setToast({
                show: true,
                type: 'success',
                title: 'Restored from Blockchain!',
                message: `Successfully restored ${result.secretCount} secrets.`,
            });
        } catch (error) {
            console.error('Restore failed:', error);
            setToast({
                show: true,
                type: 'error',
                title: 'Restore Failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setRestoring(false);
        }
    };

    // Export vault
    const handleExport = async () => {
        try {
            await vaultService.exportVault();
            setSyncStatus('Vault exported!');
            setTimeout(() => setSyncStatus(null), 3000);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    };

    // Import vault
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const result = await vaultService.importVault(file);
            await loadSecrets();
            setSyncStatus(`Imported ${result.secretCount} secrets!`);
            setTimeout(() => setSyncStatus(null), 5000);
        } catch (error) {
            console.error('Import failed:', error);
            alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }

        // Reset file input
        e.target.value = '';
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Lock className="w-12 h-12 text-emerald-500 mx-auto mb-4 animate-pulse" />
                    <p className="text-zinc-400">Decrypting vault...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden p-3 sm:p-4 space-y-3 animate-fade-in">
            {/* Header */}
            <div className="flex-none flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold text-zinc-50">Private Vault</h1>
                    <p className="text-zinc-400 text-[10px] sm:text-xs truncate">
                        <span className="hidden sm:inline">Zero-Knowledge Password Manager for your sensitive data</span>
                        <span className="sm:hidden">Zero-Knowledge Password Manager</span>
                    </p>
                </div>

                {/* Backup Result or Button */}
                {backupResult ? (
                    <div className="flex items-center gap-3 bg-pink-500/10 border border-pink-500/20 rounded-lg px-3 py-2">
                        <div className="text-right">
                            <p className="text-[10px] text-pink-400 font-medium">Backup to Sapphire</p>
                            <p className="text-[10px] text-pink-300 font-mono">
                                {backupResult.txHash.slice(0, 16)}...
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(backupResult.rawData);
                                    setToast({ show: true, type: 'success', title: 'Copied!', message: 'Raw data copied to clipboard' });
                                    setTimeout(() => setToast({ ...toast, show: false }), 2000);
                                }}
                                className="text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                title="Copy Raw Data"
                            >
                                <Copy className="w-3 h-3" />
                            </button>
                            <a
                                href={backupResult.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-pink-400 hover:text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                            >
                                <ExternalLink className="w-3 h-3" />
                                <span className="hidden sm:inline">View TXN</span>
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-stretch gap-2">
                        {lastTxHash && (
                            <a
                                href={`https://explorer.oasis.io/${lastTxNetwork === 'mainnet' ? 'mainnet' : 'testnet'}/sapphire/tx/${lastTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 md:px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 transition-colors border border-zinc-700 hover:border-zinc-600"
                                title="View Last Backup Transaction"
                            >
                                <ExternalLink className="w-3 h-3" />
                                <span className="hidden sm:inline">Last TXN</span>
                            </a>
                        )}
                        <button
                            onClick={handleSyncFromChain}
                            disabled={restoring || backingUp}
                            className="px-2 md:px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 rounded-lg text-[10px] md:text-xs font-medium flex items-center justify-center gap-1 md:gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {restoring ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Download className="w-3 h-3" />
                            )}
                            <span className="hidden sm:inline">{restoring ? 'Restoring...' : 'Restore from Sapphire'}</span>
                            <span className="sm:hidden">{restoring ? '...' : 'Restore'}</span>
                        </button>
                        <button
                            onClick={handleSyncToChain}
                            disabled={backingUp || secrets.length === 0}
                            className="px-2 md:px-3 py-1.5 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 text-pink-400 rounded-lg text-[10px] md:text-xs font-medium flex items-center justify-center gap-1 md:gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {backingUp ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Cloud className="w-3 h-3" />
                            )}
                            <span className="hidden sm:inline">{backingUp ? 'Backing up...' : 'Backup to Sapphire'}</span>
                            <span className="sm:hidden">{backingUp ? '...' : 'Backup'}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-3 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">

                {/* Security Status - Compact Grid */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 sm:gap-2">
                    <div className="p-1.5 sm:p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <KeyRound className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-blue-400 truncate">Secrets</p>
                            <p className="text-[7px] sm:text-[8px] text-blue-500">{secrets.length}</p>
                        </div>
                    </div>

                    <div className="p-1.5 sm:p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <Shield className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-emerald-400 truncate">Encrypt</p>
                            <p className="text-[7px] sm:text-[8px] text-emerald-500">AES-GCM</p>
                        </div>
                    </div>

                    <div className="p-1.5 sm:p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <Lock className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-purple-400 truncate">KDF</p>
                            <p className="text-[7px] sm:text-[8px] text-purple-500">Argon2</p>
                        </div>
                    </div>

                    <div className="p-1.5 sm:p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <KeyRound className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-amber-400 truncate">Wallet</p>
                            <p className="text-[7px] sm:text-[8px] text-amber-500">BIP-39</p>
                        </div>
                    </div>

                    <div className="p-1.5 sm:p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <Shield className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-cyan-400 truncate">Session</p>
                            <p className="text-[7px] sm:text-[8px] text-cyan-500">0-Trace</p>
                        </div>
                    </div>

                    <div className="p-1.5 sm:p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-1.5 sm:gap-2">
                        <Cloud className="w-3 h-3 text-rose-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-medium text-rose-400 truncate">Backup</p>
                            <p className="text-[7px] sm:text-[8px] text-rose-500">TEE</p>
                        </div>
                    </div>
                </div>

                {/* Search and Actions */}
                <div className="flex items-center justify-between">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search secrets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <button
                        onClick={openAddModal}
                        className="ml-3 px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-lg shadow-emerald-500/20"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Secret
                    </button>
                </div>

                {/* Empty State */}
                {secrets.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-12 bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
                        <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mb-3">
                            <KeyRound className="w-6 h-6 text-zinc-600" />
                        </div>
                        <h2 className="text-sm font-bold text-zinc-400 mb-1">No secrets yet</h2>
                        <p className="text-xs text-zinc-500 mb-4">Add your first encrypted secret to get started</p>
                        <button
                            onClick={openAddModal}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 text-xs font-bold"
                        >
                            <Plus className="w-4 h-4" />
                            Add Your First Secret
                        </button>
                    </div>
                )}

                {/* Secrets Table (Desktop) & List (Mobile) */}
                {secrets.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-zinc-950/50 border-b border-zinc-800">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Username</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Password</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">URL</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {filteredSecrets.map((secret) => (
                                        <tr key={secret.id} className="hover:bg-zinc-800/30 transition-colors group">
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 rounded bg-zinc-800 flex items-center justify-center w-6 h-6 overflow-hidden">
                                                        {secret.type === 'api_key' && getProviderLogo(secret.username) ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={getProviderLogo(secret.username)!}
                                                                alt={secret.username}
                                                                className="w-4 h-4 object-contain"
                                                            />
                                                        ) : (
                                                            <KeyRound className="w-3 h-3 text-emerald-500" />
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-medium text-zinc-200">{secret.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <code className="text-xs text-zinc-400 font-mono">{secret.username}</code>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs text-zinc-300 font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                                                        {revealedPasswords.has(secret.id) ? secret.password : maskPassword(secret.password)}
                                                    </code>
                                                    <div className="flex items-center">
                                                        <button
                                                            onClick={() => togglePasswordVisibility(secret.id)}
                                                            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                                            title={revealedPasswords.has(secret.id) ? "Hide" : "Show"}
                                                        >
                                                            {revealedPasswords.has(secret.id) ? (
                                                                <EyeOff className="w-3 h-3" />
                                                            ) : (
                                                                <Eye className="w-3 h-3" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => copyToClipboard(secret.password, secret.id)}
                                                            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                                            title="Copy"
                                                        >
                                                            {copiedId === secret.id ? (
                                                                <Check className="w-3 h-3 text-emerald-400" />
                                                            ) : (
                                                                <Copy className="w-3 h-3" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                {secret.url ? (
                                                    <a
                                                        href={secret.url.startsWith('http') ? secret.url : `https://${secret.url}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors truncate max-w-[150px] block"
                                                    >
                                                        {secret.url}
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-zinc-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => openEditModal(secret)}
                                                        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSecret(secret.id)}
                                                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
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
                            {filteredSecrets.map((secret) => (
                                <button
                                    key={secret.id}
                                    onClick={() => setViewingSecret(secret)}
                                    className="w-full p-4 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left group"
                                >
                                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 w-10 h-10 flex items-center justify-center overflow-hidden">
                                        {secret.type === 'api_key' && getProviderLogo(secret.username) ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={getProviderLogo(secret.username)!}
                                                alt={secret.username}
                                                className="w-6 h-6 object-contain"
                                            />
                                        ) : (
                                            <KeyRound className="w-5 h-5 text-emerald-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-zinc-200 truncate">{secret.name}</h3>
                                        <p className="text-xs text-zinc-500 truncate">{secret.username}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Add/Edit Modal (Compact) */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-sm w-full shadow-2xl animate-in zoom-in-95 overflow-hidden">
                            <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-950/50">
                                <h2 className="text-sm font-bold text-zinc-50">
                                    {editingSecret ? 'Edit Secret' : 'Add Secret'}
                                </h2>
                                <button
                                    onClick={() => { setShowAddModal(false); resetForm(); }}
                                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="e.g., Google Account"
                                        className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Username</label>
                                    <input
                                        type="text"
                                        value={formUsername}
                                        onChange={(e) => setFormUsername(e.target.value)}
                                        placeholder="e.g., user@example.com"
                                        className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Password *</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            placeholder="Enter or generate password"
                                            className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 font-mono"
                                        />
                                        <button
                                            onClick={generatePassword}
                                            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                                            title="Generate secure password"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">URL</label>
                                    <input
                                        type="url"
                                        value={formUrl}
                                        onChange={(e) => setFormUrl(e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Notes</label>
                                    <textarea
                                        value={formNotes}
                                        onChange={(e) => setFormNotes(e.target.value)}
                                        placeholder="Optional notes..."
                                        rows={2}
                                        className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="p-3 border-t border-zinc-800 flex gap-2 bg-zinc-950/30">
                                <button
                                    onClick={() => { setShowAddModal(false); resetForm(); }}
                                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveSecret}
                                    disabled={!formName || !formPassword}
                                    className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold transition-colors"
                                >
                                    {editingSecret ? 'Save Changes' : 'Add Secret'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Detail Modal */}
                {viewingSecret && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 w-10 h-10 flex items-center justify-center overflow-hidden">
                                        {viewingSecret.type === 'api_key' && getProviderLogo(viewingSecret.username) ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={getProviderLogo(viewingSecret.username)!}
                                                alt={viewingSecret.username}
                                                className="w-6 h-6 object-contain"
                                            />
                                        ) : (
                                            <KeyRound className="w-5 h-5 text-emerald-500" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-zinc-50">{viewingSecret.name}</h3>
                                        <p className="text-xs text-zinc-500">Secret Details</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setViewingSecret(null)}
                                    className="p-1 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-4 space-y-4">
                                {/* Username Section */}
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Username</label>
                                    <div className="flex items-center gap-2 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <span className="text-sm text-zinc-300 font-mono truncate flex-1">
                                            {viewingSecret.username}
                                        </span>
                                        <button
                                            onClick={() => {
                                                copyToClipboard(viewingSecret.username, 'username-' + viewingSecret.id);
                                            }}
                                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                                        >
                                            {copiedId === 'username-' + viewingSecret.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Password Section */}
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Password</label>
                                    <div className="flex items-center gap-2 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <span className="text-sm text-zinc-300 font-mono truncate flex-1">
                                            {revealedPasswords.has(viewingSecret.id) ? viewingSecret.password : '••••••••••••••••'}
                                        </span>
                                        <button
                                            onClick={() => togglePasswordVisibility(viewingSecret.id)}
                                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                                        >
                                            {revealedPasswords.has(viewingSecret.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                copyToClipboard(viewingSecret.password, viewingSecret.id);
                                            }}
                                            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
                                        >
                                            {copiedId === viewingSecret.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* URL Section */}
                                {viewingSecret.url && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Website</label>
                                        <a
                                            href={viewingSecret.url.startsWith('http') ? viewingSecret.url : `https://${viewingSecret.url}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 p-2.5 bg-zinc-950 hover:bg-zinc-900 rounded-lg border border-zinc-800 transition-colors group"
                                        >
                                            <Globe className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm text-blue-400 truncate flex-1 underline decoration-blue-500/30">
                                                {viewingSecret.url}
                                            </span>
                                            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400" />
                                        </a>
                                    </div>
                                )}

                                {/* Notes Section */}
                                {viewingSecret.notes && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Notes</label>
                                        <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-400 leading-relaxed max-h-24 overflow-y-auto">
                                            {viewingSecret.notes}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 flex gap-3">
                                <button
                                    onClick={() => {
                                        setViewingSecret(null); // Close details
                                        openEditModal(viewingSecret); // Open edit
                                    }}
                                    className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Edit className="w-4 h-4" /> Edit
                                </button>
                                <button
                                    onClick={() => {
                                        setViewingSecret(null); // Close details
                                        handleDeleteSecret(viewingSecret.id);
                                    }}
                                    className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toast Notification (Centered) */}
                {toast.show && (
                    <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none animate-fade-in">
                        <div className={`
                            p-4 rounded-lg border shadow-xl backdrop-blur-sm max-w-xs pointer-events-auto
                            ${toast.type === 'success' ? 'bg-zinc-900/90 border-emerald-500/30' : ''}
                            ${toast.type === 'error' ? 'bg-zinc-900/90 border-red-500/30' : ''}
                            ${toast.type === 'confirm' ? 'bg-zinc-900/95 border-amber-500/30' : ''}
                        `}>
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5
                                    ${toast.type === 'success' ? 'text-emerald-400' : ''}
                                    ${toast.type === 'error' ? 'text-red-400' : ''}
                                    ${toast.type === 'confirm' ? 'text-amber-400' : ''}
                                `}>
                                    {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
                                    {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
                                    {toast.type === 'confirm' && <AlertCircle className="w-4 h-4" />}
                                </div>
                                <div className="flex-1">
                                    <h4 className={`font-bold text-xs
                                        ${toast.type === 'success' ? 'text-emerald-400' : ''}
                                        ${toast.type === 'error' ? 'text-red-400' : ''}
                                        ${toast.type === 'confirm' ? 'text-amber-400' : ''}
                                    `}>
                                        {toast.title}
                                    </h4>
                                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">
                                        {toast.message}
                                    </p>

                                    {/* Confirm buttons */}
                                    {toast.type === 'confirm' && toast.confirmAction && (
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => setToast({ ...toast, show: false })}
                                                className="flex-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-medium transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    toast.confirmAction!();
                                                }}
                                                className="flex-1 py-1.5 px-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded text-[10px] font-medium transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {toast.type !== 'confirm' && (
                                    <button
                                        onClick={() => setToast({ ...toast, show: false })}
                                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}