'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type NetworkType = 'testnet' | 'mainnet';

interface NetworkContextType {
    network: NetworkType;
    targetNetwork: NetworkType | null;
    isTransitioning: boolean;
    switchNetwork: (target: NetworkType) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

const NETWORK_CONFIGS = {
    testnet: {
        name: 'Oasis Sapphire Testnet',
        rpc: 'https://testnet.sapphire.oasis.dev',
        chainId: '0x5aff',
        runtimeId: '000000000000000000000000000000000000000000000000f80306c9858e7279',
    },
    mainnet: {
        name: 'Oasis Sapphire Mainnet',
        rpc: 'https://sapphire.oasis.io',
        chainId: '0x5afe',
        runtimeId: '000000000000000000000000000000000000000000000000f80306c9858e7279',
    },
};

export function NetworkProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [network, setNetwork] = useState<NetworkType>('testnet');
    const [targetNetwork, setTargetNetwork] = useState<NetworkType | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Load saved network from localStorage, scoped to user
    useEffect(() => {
        // Always reset to testnet when user changes or logs out
        setNetwork('testnet');
        setTargetNetwork(null);
        setIsTransitioning(false);

        if (!user?.address) {
            console.log('[Network] No user, defaulting to testnet');
            return;
        }

        const saved = localStorage.getItem(`pribado_network_${user.address}`);
        if (saved === 'mainnet' || saved === 'testnet') {
            console.log(`[Network] Restored saved network for ${user.shortAddress}: ${saved}`);
            setNetwork(saved as NetworkType);
            localStorage.setItem('pribado_network', saved); // Sync global key
        } else {
            console.log(`[Network] No saved network for ${user.shortAddress}, defaulting to testnet`);
            localStorage.setItem('pribado_network', 'testnet'); // Sync global key
        }
    }, [user?.address]);

    const switchNetwork = async (target: NetworkType) => {
        if (target === network || isTransitioning) return;

        console.log(`[Network] Switching from ${network} to ${target}...`);
        setTargetNetwork(target);
        setIsTransitioning(true);

        // Simulate network switch delay (for animation)
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Save to localStorage - both global and user-scoped keys
        // Global key is used by services that don't have direct access to user context
        localStorage.setItem('pribado_network', target);
        if (user?.address) {
            localStorage.setItem(`pribado_network_${user.address}`, target);
        }

        setNetwork(target);
        console.log(`[Network] Successfully switched to ${target}`);
        console.log(`[Network] RPC: ${target === 'mainnet' ? 'https://sapphire.oasis.io' : 'https://testnet.sapphire.oasis.dev'}`);

        // Small delay before ending transition
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsTransitioning(false);
        setTargetNetwork(null);
    };

    return (
        <NetworkContext.Provider value={{ network, targetNetwork, isTransitioning, switchNetwork }}>
            {children}
        </NetworkContext.Provider>
    );
}

export function useNetwork() {
    const context = useContext(NetworkContext);
    if (!context) {
        throw new Error('useNetwork must be used within NetworkProvider');
    }
    return context;
}

export { NETWORK_CONFIGS };
