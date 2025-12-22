'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, User, LogOut, ChevronDown, Copy, Check, Key, X, ShieldAlert, Menu, Zap, Globe } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetwork } from '@/contexts/NetworkContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/components/Toast';

interface HeaderProps {
    onMenuToggle?: () => void;
    onShowPaywall?: () => void;
}

export default function Header({ onMenuToggle, onShowPaywall }: HeaderProps) {
    const router = useRouter();
    const { isAuthenticated, user, logout, getSeedPhrase } = useAuth();
    const { network, switchNetwork, isTransitioning } = useNetwork();
    const { isActive: hasSubscription } = useSubscription();
    const { showToast } = useToast();
    const [showDropdown, setShowDropdown] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [seedPhrase, setSeedPhrase] = useState<string | null>(null);
    const [seedCopied, setSeedCopied] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Notification state
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<Array<{ id: string; type: string; title: string; message: string; createdAt: number; read: boolean }>>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const notificationRef = useRef<HTMLDivElement>(null);

    // Track previous transition state to show toast when transition ends
    const prevTransitioningRef = useRef(isTransitioning);
    useEffect(() => {
        // Toast shows when: transitioning goes from true to false
        if (prevTransitioningRef.current && !isTransitioning) {
            showToast(`Successfully switched to ${network === 'mainnet' ? 'Mainnet' : 'Testnet'}`, 'success');
        }
        prevTransitioningRef.current = isTransitioning;
    }, [network, isTransitioning, showToast]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch notifications periodically
    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const res = await fetch('/api/notifications');
                const data = await res.json();
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            } catch (e) {
                console.error('Failed to fetch notifications', e);
            }
        };
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const handleCopyAddress = () => {
        if (user?.address) {
            navigator.clipboard.writeText(user.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleBackupWallet = async () => {
        // Recover seed phrase from secure session
        const storedSeed = user ? await getSeedPhrase() : null;
        if (storedSeed) {
            setSeedPhrase(storedSeed);
            setShowSeedModal(true);
            setShowDropdown(false);
        } else {
            console.error('Failed to retrieve seed phrase');
        }
    };

    const handleCopySeed = () => {
        if (seedPhrase) {
            navigator.clipboard.writeText(seedPhrase);
            setSeedCopied(true);
            setTimeout(() => setSeedCopied(false), 2000);
        }
    };

    const closeSeedModal = () => {
        setShowSeedModal(false);
        setSeedPhrase(null);
        setSeedCopied(false);
    };

    const handleNetworkSwitch = () => {
        const target = network === 'testnet' ? 'mainnet' : 'testnet';

        // Check if trying to switch to mainnet without subscription
        if (target === 'mainnet' && !hasSubscription) {
            onShowPaywall?.();
            return;
        }

        switchNetwork(target);
    };

    return (
        <>
            <header className="fixed top-0 left-0 md:left-64 right-0 h-16 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 z-40">

                {/* Left Side - Hamburger Menu + Network Toggle */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onMenuToggle}
                        className="p-2 text-zinc-400 hover:text-zinc-50 transition-colors md:hidden"
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    {/* Network Toggle Button */}
                    <button
                        onClick={handleNetworkSwitch}
                        disabled={isTransitioning}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold
                            transition-all duration-300 border
                            ${network === 'mainnet'
                                ? 'bg-gradient-to-r from-blue-500/20 to-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:from-blue-500/30 hover:to-emerald-500/30'
                                : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
                            }
                            ${isTransitioning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                    >
                        {network === 'mainnet' ? (
                            <>
                                <Globe className="w-3.5 h-3.5" />
                                <span>Mainnet</span>
                            </>
                        ) : (
                            <>
                                <Globe className="w-3.5 h-3.5" />
                                <span>Testnet</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-4">


                    {/* User Profile Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <img
                                src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${user?.address || 'default'}&backgroundColor=10b981`}
                                alt="Avatar"
                                className="w-6 h-6 rounded-full"
                            />
                            <span className="text-xs font-medium text-zinc-50">
                                {user?.shortAddress || 'Admin'}
                            </span>
                            <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Menu */}
                        {showDropdown && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                                {/* User Info */}
                                <div className="p-4 border-b border-zinc-800">
                                    <p className="text-xs text-zinc-500 mb-1">Wallet Address</p>
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm text-zinc-300 font-mono truncate flex-1">
                                            {user?.address || '0x...'}
                                        </code>
                                        <button
                                            onClick={handleCopyAddress}
                                            className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors"
                                            title="Copy address"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Menu Items */}
                                <div className="p-2">
                                    <button
                                        onClick={handleBackupWallet}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                                    >
                                        <Key className="w-4 h-4" />
                                        <span className="text-sm font-medium">Backup Wallet</span>
                                    </button>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span className="text-sm font-medium">Logout</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Seed Phrase Backup Modal */}
            {showSeedModal && seedPhrase && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full mx-4 shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 text-amber-500" />
                                <h2 className="text-lg font-bold text-zinc-50">Backup Seed Phrase</h2>
                            </div>
                            <button
                                onClick={closeSeedModal}
                                className="p-1 text-zinc-400 hover:text-zinc-50 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Warning */}
                        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20">
                            <p className="text-amber-400 text-sm">
                                <strong>⚠️ Never share this!</strong> Anyone with your seed phrase can access your wallet and keys.
                            </p>
                        </div>

                        {/* Seed Phrase Display */}
                        <div className="p-4">
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-sm text-zinc-300 leading-relaxed">
                                {seedPhrase.split(' ').map((word, i) => (
                                    <span key={i} className="inline-block mr-2 mb-2">
                                        <span className="text-zinc-600 text-xs mr-1">{i + 1}.</span>
                                        <span className="bg-zinc-800 px-2 py-1 rounded">{word}</span>
                                    </span>
                                ))}
                            </div>

                            {/* Copy Button */}
                            <button
                                onClick={handleCopySeed}
                                className="w-full mt-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {seedCopied ? (
                                    <>
                                        <Check className="w-4 h-4 text-emerald-400" />
                                        <span className="text-emerald-400">Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        <span>Copy Seed Phrase</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-zinc-800">
                            <button
                                onClick={closeSeedModal}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors"
                            >
                                I've Saved My Seed Phrase
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}