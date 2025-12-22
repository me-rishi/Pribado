'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface TimeRemaining {
    days: number;
    months: number;
    years: number;
    totalDays: number;
    formatted: string;
}

interface SubscriptionContextType {
    isActive: boolean;
    expiresAt: number | null;
    getTimeRemaining: () => TimeRemaining | null;
    setSubscription: (expiresAt: number) => void;
    clearSubscription: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

const STORAGE_KEY = 'pribado_subscription';

export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [expiresAt, setExpiresAt] = useState<number | null>(null);

    // Load subscription when user changes
    useEffect(() => {
        // Reset subscription when user changes
        setExpiresAt(null);

        if (!user?.address) {
            console.log('[Subscription] No user, clearing subscription state');
            return;
        }

        const stored = localStorage.getItem(`${STORAGE_KEY}_${user.address}`);
        if (stored) {
            const expiry = parseInt(stored, 10);
            setExpiresAt(expiry);
            console.log(`[Subscription] Loaded for ${user.shortAddress}: expires ${new Date(expiry).toLocaleDateString()}`);
        } else {
            console.log(`[Subscription] No subscription for ${user.shortAddress}`);
        }
    }, [user?.address]);

    const isActive = expiresAt !== null && expiresAt > Date.now();

    const getTimeRemaining = (): TimeRemaining | null => {
        if (!expiresAt) return null;

        const now = Date.now();
        const remaining = expiresAt - now;

        if (remaining <= 0) {
            return { days: 0, months: 0, years: 0, totalDays: 0, formatted: 'Expired' };
        }

        const totalDays = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const years = Math.floor(totalDays / 365);
        const months = Math.floor((totalDays % 365) / 30);
        const days = totalDays % 30;

        // Format string
        const parts: string[] = [];
        if (years > 0) parts.push(`${years}y`);
        if (months > 0) parts.push(`${months}m`);
        if (days > 0 || parts.length === 0) parts.push(`${days}d`);

        return {
            days,
            months,
            years,
            totalDays,
            formatted: parts.join(' ')
        };
    };

    const setSubscription = (newExpiresAt: number) => {
        if (!user?.address) {
            console.warn('[Subscription] Cannot set subscription: not logged in');
            return;
        }

        localStorage.setItem(`${STORAGE_KEY}_${user.address}`, newExpiresAt.toString());
        setExpiresAt(newExpiresAt);
        console.log(`[Subscription] Set for ${user.shortAddress}: expires ${new Date(newExpiresAt).toLocaleDateString()}`);
    };

    const clearSubscription = () => {
        if (!user?.address) return;

        localStorage.removeItem(`${STORAGE_KEY}_${user.address}`);
        setExpiresAt(null);
        console.log(`[Subscription] Cleared for ${user.shortAddress}`);
    };

    return (
        <SubscriptionContext.Provider value={{
            isActive,
            expiresAt,
            getTimeRemaining,
            setSubscription,
            clearSubscription
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
}

export function useSubscription() {
    const context = useContext(SubscriptionContext);
    if (!context) {
        throw new Error('useSubscription must be used within SubscriptionProvider');
    }
    return context;
}
