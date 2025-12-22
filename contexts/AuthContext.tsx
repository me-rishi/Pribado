'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';
import { vaultService } from '@/services/vaultService';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: {
        address: string;
        shortAddress: string;
    } | null;
    login: (seedPhrase: string) => Promise<boolean>;
    signup: (seedPhrase: string) => Promise<{ success: boolean; seedPhrase: string }>;
    logout: () => void;
    generateSeedPhrase: () => string;
    getSeedPhrase: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Derive real Ethereum address from BIP39 seed phrase using BIP44 standard path
function seedToAddress(seedPhrase: string): string | null {
    try {
        const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase.trim().toLowerCase());
        const hdWallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
        return hdWallet.address;
    } catch (error) {
        console.error('Invalid seed phrase:', error);
        return null;
    }
}

// Secure seed storage using AES-GCM encryption
// Key derived from browser fingerprint + app salt (not perfect, but much better than base64)
const SEED_ENCRYPTION_SALT = 'pribado-seed-v2-secure';

async function deriveStorageKey(): Promise<CryptoKey> {
    // Create a browser-specific fingerprint (hard to replicate from another context)
    const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset().toString(),
        SEED_ENCRYPTION_SALT,
    ].join('|');

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(fingerprint),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode(SEED_ENCRYPTION_SALT),
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptSeed(seedPhrase: string): Promise<string> {
    const key = await deriveStorageKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(seedPhrase)
    );

    // Combine IV + ciphertext and base64 encode
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

async function decryptSeed(encryptedData: string): Promise<string | null> {
    try {
        const key = await deriveStorageKey();
        const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.warn('Session decryption failed (auth invalid or expired):', error);
        return null;
    }
}

// Internal helper for enclave key storage (used before exports are available)
async function storeEnclaveKeyInternal(key: string): Promise<void> {
    const encrypted = await encryptSeed(key);
    sessionStorage.setItem('pribado_enclave_encrypted', encrypted);
    sessionStorage.removeItem('pribado_enclave_key');
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<{ address: string; shortAddress: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize vault when session is restored
    useEffect(() => {
        // Zero-Trace: Clean up any legacy localStorage items to prevent disk persistence
        if (localStorage.getItem('pribado_auth') || localStorage.getItem('pribado_seed_hash')) {
            console.log('Cleaning up legacy localStorage artifacts...');
            localStorage.removeItem('pribado_auth');
            localStorage.removeItem('pribado_seed_hash');
        }

        // Restore from sessionStorage (survives refresh, wiped on close)
        const storedAuth = sessionStorage.getItem('pribado_auth');
        const storedSeed = sessionStorage.getItem('pribado_seed_encrypted');

        if (storedAuth && storedSeed) {
            const parsed = JSON.parse(storedAuth);

            // Decrypt seed phrase asynchronously
            decryptSeed(storedSeed).then(async (seedPhrase) => {
                if (!seedPhrase) {
                    sessionStorage.removeItem('pribado_auth');
                    sessionStorage.removeItem('pribado_seed_encrypted');
                    setIsLoading(false);
                    return;
                }

                // Initialize vault with stored seed
                const success = await vaultService.initialize(seedPhrase);
                if (success) {
                    // Re-derive and unlock enclave
                    try {
                        const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase.trim().toLowerCase());
                        const hdWallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);
                        const signature = await hdWallet.signMessage('Pribado Enclave Access v1');
                        const enclaveKey = ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(2, 66);
                        await storeEnclaveKeyInternal(enclaveKey);

                        await fetch('/api/enclave/unlock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ enclaveKey, owner: parsed.address })
                        });
                    } catch (e) {
                        console.error('Failed to unlock enclave on restore:', e);
                    }

                    setUser(parsed);
                    setIsAuthenticated(true);
                    console.log('Vault initialized from secure encrypted session');
                } else {
                    sessionStorage.removeItem('pribado_auth');
                    sessionStorage.removeItem('pribado_seed_encrypted');
                }
                setIsLoading(false);
            }).catch(() => {
                sessionStorage.removeItem('pribado_auth');
                sessionStorage.removeItem('pribado_seed_encrypted');
                setIsLoading(false);
            });
        } else {
            setIsLoading(false); // Done loading (no session)
        }
    }, []);

    const generateSeedPhrase = (): string => {
        const randomWallet = ethers.Wallet.createRandom();
        return randomWallet.mnemonic!.phrase;
    };

    const getSeedPhrase = async (): Promise<string | null> => {
        const stored = sessionStorage.getItem('pribado_seed_encrypted');
        if (stored) {
            return decryptSeed(stored);
        }
        return null;
    };

    const login = async (seedPhrase: string): Promise<boolean> => {
        const address = seedToAddress(seedPhrase);
        if (!address) {
            return false;
        }

        // Initialize vault with seed phrase
        const vaultInitialized = await vaultService.initialize(seedPhrase);
        if (!vaultInitialized) {
            console.error('Failed to initialize vault');
            return false;
        }

        // Derive enclave key from wallet signature
        try {
            const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase.trim().toLowerCase());
            const hdWallet = ethers.HDNodeWallet.fromMnemonic(mnemonic);

            // Sign a fixed message to derive enclave key
            const enclaveMessage = 'Pribado Enclave Access v1';
            const signature = await hdWallet.signMessage(enclaveMessage);

            // Hash signature to get 32-byte key
            const enclaveKey = ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(2, 66); // 32 hex chars

            // Store enclave key securely (encrypted)
            await storeEnclaveKeyInternal(enclaveKey);

            // Unlock server-side enclave
            await fetch('/api/enclave/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enclaveKey, owner: address })
            });

            console.log('Enclave unlocked for wallet:', address);
        } catch (e) {
            console.error('Failed to derive enclave key:', e);
        }

        const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        const userData = { address, shortAddress };

        // Store in sessionStorage with AES-GCM encryption (Zero-Trace on disk, persists on refresh)
        sessionStorage.setItem('pribado_auth', JSON.stringify(userData));
        const encryptedSeed = await encryptSeed(seedPhrase);
        sessionStorage.setItem('pribado_seed_encrypted', encryptedSeed);

        setUser(userData);
        setIsAuthenticated(true);

        return true;
    };

    const signup = async (seedPhrase: string): Promise<{ success: boolean; seedPhrase: string }> => {
        const finalSeed = seedPhrase || generateSeedPhrase();
        const success = await login(finalSeed);
        return { success, seedPhrase: finalSeed };
    };

    const logout = () => {
        sessionStorage.removeItem('pribado_auth');
        sessionStorage.removeItem('pribado_seed_encrypted');
        sessionStorage.removeItem('pribado_seed_hash'); // Clean legacy
        vaultService.clear();
        setUser(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, signup, logout, generateSeedPhrase, getSeedPhrase }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Export encryption utilities for enclave key storage
export async function encryptEnclaveKey(enclaveKey: string): Promise<string> {
    return encryptSeed(enclaveKey); // Reuse seed encryption
}

export async function decryptEnclaveKey(encryptedData: string): Promise<string | null> {
    return decryptSeed(encryptedData); // Reuse seed decryption
}

// Store enclave key securely
export async function storeEnclaveKey(key: string): Promise<void> {
    const encrypted = await encryptEnclaveKey(key);
    sessionStorage.setItem('pribado_enclave_encrypted', encrypted);
    // Remove legacy plain key if exists
    sessionStorage.removeItem('pribado_enclave_key');
}

// Retrieve enclave key securely
export async function getEnclaveKey(): Promise<string | null> {
    // Check encrypted first
    const encrypted = sessionStorage.getItem('pribado_enclave_encrypted');
    if (encrypted) {
        return decryptEnclaveKey(encrypted);
    }
    // Fallback to legacy (migrate on first use)
    const legacy = sessionStorage.getItem('pribado_enclave_key');
    if (legacy) {
        await storeEnclaveKey(legacy); // Migrate to encrypted
        return legacy;
    }
    return null;
}
