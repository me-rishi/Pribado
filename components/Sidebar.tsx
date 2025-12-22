'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
    LayoutDashboard,
    Mail,
    Bot,
    FileSignature,
    KeyRound,
    Server,
    Lock,
    Circle,
    ShieldCheck,
    Database,
    X,
    Zap,
    Crown,
    Calendar
} from 'lucide-react';

const navigation = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Private Mail', href: '/mail', icon: Mail },
    { name: 'Enclave Chat', href: '/privchat', icon: Bot },
    { name: 'Secure Docs', href: '/docs', icon: FileSignature },
    { name: 'Private Vault', href: '/vault', icon: KeyRound },
    { name: 'Private API', href: '/api-keys', icon: Server },
    { name: 'Verify', href: '/verify', icon: ShieldCheck },
    { name: 'Backup', href: '/backup', icon: Database },
];

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
    onShowPaywall?: () => void;
}

export default function Sidebar({ isOpen = false, onClose, onShowPaywall }: SidebarProps) {
    const pathname = usePathname();
    const { isActive, getTimeRemaining } = useSubscription();
    const timeRemaining = getTimeRemaining();

    const [rateLimit, setRateLimit] = useState<{
        remaining: number;
        maxTransactions: number;
        minutesUntilReset: number;
    } | null>(null);

    // Fetch rate limit status (per wallet)
    useEffect(() => {
        const fetchRateLimit = async () => {
            try {
                // Get wallet address from sessionStorage (set during login)
                const authData = typeof window !== 'undefined'
                    ? sessionStorage.getItem('pribado_auth')
                    : null;

                const wallet = authData ? JSON.parse(authData).address : '';

                if (!wallet) return;

                const res = await fetch(`/api/rate-limit-status?wallet=${encodeURIComponent(wallet)}`);
                if (res.ok) {
                    const data = await res.json();
                    setRateLimit(data);
                }
            } catch (e) {
                // Silent fail
            }
        };

        fetchRateLimit();
        // Refresh every minute
        const interval = setInterval(fetchRateLimit, 60000);

        // Also refresh on focus (when user returns to tab)
        const handleFocus = () => fetchRateLimit();
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed left-0 top-0 h-full w-56 md:w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col z-50
                transform transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                md:translate-x-0
            `}>
                {/* Logo Area - Compact on mobile */}
                <div className="flex items-center justify-between px-4 md:px-6 py-4 md:py-6 border-b border-zinc-800">
                    <div className="flex items-center gap-2 md:gap-3">
                        <img src="/logo.png" alt="Pribado" className="w-10 h-10 md:w-12 md:h-12 object-contain" />
                        <div className="flex flex-col">
                            <span className="text-xl md:text-2xl font-extrabold text-zinc-50">Pribado</span>
                            <span className="text-xs text-zinc-400 italic font-light">Self-sovereign<br />Key Manager</span>
                        </div>
                    </div>
                    {/* Close button - mobile only */}
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-zinc-50 md:hidden"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Links - Compact on mobile */}
                <nav className="flex-1 px-3 md:px-4 py-4 md:py-6 overflow-y-auto">
                    <ul className="space-y-1 md:space-y-2">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            const isComingSoon = item.name === 'Private Mail';

                            return (
                                <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        onClick={onClose}
                                        className={`
                                            flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg transition-all duration-200
                                            ${isActive
                                                ? 'bg-zinc-800 text-emerald-500'
                                                : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50'
                                            }
                                        `}
                                    >
                                        <Icon className="w-4 h-4 md:w-5 md:h-5" />
                                        <span className="font-medium text-sm md:text-base">{item.name}</span>
                                        {isComingSoon && (
                                            <span className="ml-auto text-[8px] md:text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1 md:px-1.5 py-0.5 rounded border border-emerald-500/30">
                                                SOON
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Subscription Counter */}
                <div className="px-3 md:px-6 pb-2 space-y-1.5">
                    {isActive && timeRemaining ? (
                        <button
                            onClick={onShowPaywall}
                            className="w-full bg-gradient-to-r from-blue-500/10 to-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 rounded px-2 py-1.5 transition-all group cursor-pointer"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Crown className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] font-medium text-emerald-400">PRO</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-zinc-400 group-hover:text-emerald-400" />
                                    <span className="text-xs font-mono font-medium text-zinc-200 group-hover:text-emerald-300">
                                        {timeRemaining.formatted}
                                    </span>
                                    <span className="text-[8px] text-zinc-500 group-hover:text-emerald-400">+</span>
                                </div>
                            </div>
                        </button>
                    ) : (
                        <button
                            onClick={onShowPaywall}
                            className="w-full bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/30 rounded px-2 py-1.5 transition-all group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Crown className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400" />
                                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-emerald-400">FREE</span>
                                </div>
                                <span className="text-[9px] font-medium text-zinc-500 group-hover:text-emerald-400">
                                    Upgrade →
                                </span>
                            </div>
                        </button>
                    )}
                </div>

                {/* Rate Limit Counter - Compact */}
                {rateLimit && (
                    <div className="px-3 md:px-6 pb-2 space-y-1.5">
                        {/* Warning - Single line */}
                        <div className="bg-red-500/10 border border-red-500/30 rounded px-2 py-1 text-center">
                            <span className="text-[9px] font-medium text-red-400">Daily Gas Limit</span>
                        </div>

                        {/* Rate Limit - Inline */}
                        <div className="bg-zinc-800/50 rounded px-2 py-1.5 border border-zinc-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm">⛽</span>
                                <span className={`text-xs font-mono font-medium ${rateLimit.remaining <= 1 ? 'text-red-400' : rateLimit.remaining <= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {rateLimit.remaining}/{rateLimit.maxTransactions}
                                </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">{rateLimit.minutesUntilReset}m</span>
                        </div>
                    </div>
                )}

                {/* Footer - TEE Status - Compact */}
                <div className="px-3 md:px-6 py-2 md:py-4 border-t border-zinc-800">
                    <div className="flex items-center justify-end gap-2 md:gap-3">
                        <span className="text-xs md:text-sm font-medium text-zinc-50">TEE Active</span>
                        <div className="relative">
                            <Circle className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-500 fill-emerald-500" />
                            <Circle className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-500 absolute inset-0 animate-ping" />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}