'use client';

import { useState } from 'react';
import { backupService } from '@/services/backupService';
import { vaultService } from '@/services/vaultService';
import {
    Download,
    Upload,
    Shield,
    Database,
    AlertTriangle,
    CheckCircle,
    Loader2,
    Lock,
    FileJson,
    RefreshCw
} from 'lucide-react';

export default function BackupPage() {
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<{ secrets: number; emails: number; drafts: number; aliases?: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal State
    const [activeModal, setActiveModal] = useState<'backup' | 'restore' | null>(null);
    const [modalPassword, setModalPassword] = useState('');
    const [restoreFile, setRestoreFile] = useState<File | null>(null);

    // Reset state when opening/closing modals
    const openBackupModal = () => {
        setActiveModal('backup');
        setModalPassword('');
        setError(null);
        setSuccessMessage(null);
    };

    const openRestoreModal = () => {
        setActiveModal('restore');
        setModalPassword('');
        setRestoreFile(null);
        setError(null);
        setSuccessMessage(null);
        setStats(null);
    };

    const closeModal = () => {
        setActiveModal(null);
        setModalPassword('');
        setRestoreFile(null);
    };

    // Create Backup Handler
    const handleBackup = async () => {
        setLoading(true);
        setError(null);
        try {
            if (!vaultService.isInitialized()) {
                throw new Error('Please unlock your vault first.');
            }

            // Password is OPTIONAL for backup creation
            const backup = await backupService.createBackup(modalPassword || undefined);
            backupService.downloadBackup(backup);

            setSuccessMessage('Backup created and downloaded successfully!');
            closeModal();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to create backup');
        } finally {
            setLoading(false);
        }
    };

    // Restore Backup Handler
    const handleRestore = async () => {
        if (!restoreFile) return;

        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        setStats(null);

        try {
            if (!vaultService.isInitialized()) {
                throw new Error('Please unlock your vault first using your seed phrase.');
            }

            // We pass the password if provided. If the file is protected and no password is provided,
            // the service will throw "This backup is password protected".
            // The user can then retry with a password.
            // But since we are inside the modal designated for validation, we expect them to enter it if known.
            const result = await backupService.restoreBackup(restoreFile, modalPassword || undefined);

            if (result.success) {
                setStats(result.stats);
                setSuccessMessage('Restore complete! Your data has been merged.');
                closeModal();
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to restore backup');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 pb-24 md:pb-4 max-w-4xl mx-auto relative animate-fade-in flex flex-col">
            {/* Header */}
            <div className="mb-6 text-center">
                <h1 className="text-xl font-bold text-zinc-50 flex items-center justify-center gap-2">
                    <Database className="w-5 h-5 text-emerald-500" />
                    Global Backup & Restore
                </h1>
                <p className="text-zinc-400 mt-1 text-sm max-w-lg mx-auto">
                    Securely backup your workspace with double-layer encryption (Wallet + Password).
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Backup Card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center text-center shadow-lg hover:border-emerald-500/30 transition-all">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                        <Download className="w-6 h-6 text-emerald-500" />
                    </div>

                    <h2 className="text-lg font-bold text-zinc-50 mb-1">Create Backup</h2>
                    <p className="text-zinc-400 mb-4 text-xs max-w-xs">
                        Download a password-protected encrypted file containing secrets, keys, and emails.
                    </p>

                    <div className="w-full bg-zinc-800/50 rounded-lg p-3 mb-6 text-left space-y-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                            <Lock className="w-3.5 h-3.5 text-emerald-500" />
                            <span>AES-GCM (Double Layer)</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                            <Shield className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Zero Knowledge</span>
                        </div>
                    </div>

                    <div className="mt-auto w-full">
                        <button
                            onClick={openBackupModal}
                            className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Download Backup
                        </button>
                    </div>
                </div>

                {/* Restore Card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center text-center shadow-lg hover:border-blue-500/30 transition-all">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                        <Upload className="w-6 h-6 text-blue-500" />
                    </div>

                    <h2 className="text-lg font-bold text-zinc-50 mb-1">Restore Backup</h2>
                    <p className="text-zinc-400 mb-4 text-xs max-w-xs">
                        Import a backup file to restore your workspace data.
                    </p>

                    <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-6 text-left">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-200 leading-tight">
                                <span className="font-bold">Note:</span> Restoring merges data. Wallet address MUST match the backup owner.
                            </p>
                        </div>
                    </div>

                    <div className="mt-auto w-full">
                        <button
                            onClick={openRestoreModal}
                            className="w-full py-2.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 hover:text-white transition-colors flex items-center justify-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Select Backup File
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Messages - Show only when NOT in modal to avoid clustering */}
            {!activeModal && error && (
                <div className="mt-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 animate-fade-in">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                    <div>
                        <h3 className="font-bold text-red-400">Action Failed</h3>
                        <p className="text-sm text-red-300">{error}</p>
                    </div>
                </div>
            )}

            {!activeModal && successMessage && (
                <div className="mt-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-fade-in">
                    <div className="flex items-center gap-3 mb-2">
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                        <h3 className="font-bold text-emerald-400">{successMessage}</h3>
                    </div>
                    {stats && (
                        <div className="ml-9 grid grid-cols-3 gap-4 mt-2">
                            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Secrets</p>
                                <p className="text-xl font-bold text-zinc-100">{stats.secrets}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Emails</p>
                                <p className="text-xl font-bold text-zinc-100">{stats.emails}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Drafts</p>
                                <p className="text-xl font-bold text-zinc-100">{stats.drafts}</p>
                            </div>
                            <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-700">
                                <p className="text-xs text-zinc-400 uppercase tracking-wider">Aliases</p>
                                <p className="text-xl font-bold text-zinc-100">{stats.aliases || 0}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* BACKUP MODAL */}
            {activeModal === 'backup' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rounded-xl">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
                        <h3 className="text-lg font-bold text-white mb-2">Backup Security</h3>
                        <p className="text-zinc-400 text-sm mb-4">
                            Optionally protect your backup with a password. If you add one, you MUST provide it to restore.
                        </p>

                        <input
                            type="password"
                            placeholder="Password (Optional)"
                            value={modalPassword}
                            onChange={(e) => setModalPassword(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 mb-6"
                        />

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleBackup}
                                disabled={loading}
                                className="w-full py-2.5 bg-emerald-500 text-white rounded-lg font-bold text-sm hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {modalPassword ? 'Encrypt & Download' : 'Download without Password'}
                            </button>
                            <button
                                onClick={closeModal}
                                className="w-full py-2 text-zinc-400 text-xs hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RESTORE MODAL */}
            {activeModal === 'restore' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rounded-xl">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
                        <h3 className="text-lg font-bold text-white mb-2">Restore Backup</h3>

                        {/* Error inside modal */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-200">{error}</p>
                            </div>
                        )}

                        {!restoreFile ? (
                            <>
                                <p className="text-zinc-400 text-sm mb-4">
                                    Select a backup file to restore. If it's password protected, enter the password below.
                                </p>
                                <input
                                    type="password"
                                    placeholder="Decryption Password (if required)"
                                    value={modalPassword}
                                    onChange={(e) => setModalPassword(e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 mb-4"
                                />
                                <label className="w-full cursor-pointer block mb-2">
                                    <input
                                        type="file"
                                        accept=".json,.blob"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) setRestoreFile(e.target.files[0]);
                                        }}
                                        className="hidden"
                                    />
                                    <div className="w-full py-2.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg font-bold text-sm hover:bg-zinc-700 hover:text-white transition-colors flex items-center justify-center gap-2">
                                        <Upload className="w-4 h-4" />
                                        Select File
                                    </div>
                                </label>
                            </>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center gap-3">
                                    <FileJson className="w-6 h-6 text-emerald-500" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-zinc-200 truncate">{restoreFile.name}</p>
                                        <p className="text-xs text-zinc-500">
                                            {(restoreFile.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setRestoreFile(null)}
                                        className="ml-auto text-zinc-500 hover:text-red-400 p-1"
                                    >
                                        <CheckCircle className="w-4 h-4 hidden" /> {/* dummy icon to keep types happy if needed, but really we want an X */}
                                        Change
                                    </button>
                                </div>

                                <button
                                    onClick={handleRestore}
                                    disabled={loading}
                                    className="w-full py-2.5 bg-blue-500 text-white rounded-lg font-bold text-sm hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    Start Restore
                                </button>
                            </div>
                        )}

                        <button
                            onClick={closeModal}
                            className="w-full mt-2 py-2 text-zinc-400 text-xs hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
