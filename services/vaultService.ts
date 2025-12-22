// Real Confidential Vault Service
// Uses AES-GCM encryption with keys derived from user's HD wallet

import { ethers } from 'ethers';
import { argon2id } from 'hash-wasm';
import { roflCore, ROFLEncryptedBlob } from './roflCore';

export interface VaultSecret {
    id: string;
    name: string;
    username: string;
    password: string; // Stored encrypted
    url?: string;
    notes?: string;
    createdAt: number;
    updatedAt: number;
    type?: 'password' | 'api_key'; // Distinguish between standard secrets and API keys
}

export interface EncryptedBlob {
    iv: string;      // Base64 IV
    data: string;    // Base64 ciphertext
    tag: string;     // Auth tag (included in ciphertext for WebCrypto AES-GCM)
    kdf?: 'pbkdf2' | 'argon2id'; // Track which KDF was used
    rofl?: ROFLEncryptedBlob;    // ROFL TEE encryption data (if used)
}

const VAULT_STORAGE_KEY = 'pribado_vault_encrypted';
const SALT = 'pribado-vault-v1'; // Application-specific salt

export class VaultService {
    private encryptionKey: CryptoKey | null = null;
    private userAddress: string | null = null;
    private currentKdf: 'pbkdf2' | 'argon2id' = 'argon2id'; // Default to new standard

    // Helper: Get wallet from seed
    private getWallet(seedPhrase: string): ethers.HDNodeWallet {
        const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase.trim().toLowerCase());
        return ethers.HDNodeWallet.fromMnemonic(mnemonic);
    }

    // Modern: Argon2id Derivation (Memory-Hard)
    private async deriveKeyArgon2id(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
        // 1. Generate 32-byte hash using Argon2id
        // Params: 64MB memory, 3 iterations, parallelism 1
        const hashHex = await argon2id({
            password: privateKeyBytes,
            salt: new TextEncoder().encode(SALT),
            parallelism: 1,
            iterations: 3,
            memorySize: 64000, // 64 MB
            hashLength: 32,    // 256 bits
            outputType: 'hex',
        });

        // 2. Import as AES-GCM Key
        // Convert hex to buffer
        const hashBuffer = new Uint8Array(
            hashHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        );

        return crypto.subtle.importKey(
            'raw',
            hashBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Legacy: PBKDF2 Derivation
    private async deriveKeyPBKDF2(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
        // Use Uint8Array directly as BufferSource
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            privateKeyBytes as unknown as BufferSource,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const encoder = new TextEncoder();
        const salt = encoder.encode(SALT);

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Initialize vault: Smart detection of KDF
    async initialize(seedPhrase: string): Promise<boolean> {
        try {
            const wallet = this.getWallet(seedPhrase);
            this.userAddress = wallet.address;
            const privateKeyBytes = ethers.getBytes(wallet.privateKey);

            // 1. Check if we have stored data to test against
            const storageKey = this.getStorageKey();
            const storedData = localStorage.getItem(storageKey);

            if (!storedData) {
                // New Vault -> Use Argon2id immediately
                console.log('[Vault] New setup. Using Argon2id.');
                this.encryptionKey = await this.deriveKeyArgon2id(privateKeyBytes);
                this.currentKdf = 'argon2id';
                return true;
            }

            // 2. Existing Vault -> Try Argon2id first (Preferred)
            const argonKey = await this.deriveKeyArgon2id(privateKeyBytes);
            this.encryptionKey = argonKey;

            try {
                // Attempt decrypt
                await this.loadSecrets();
                console.log('[Vault] Unlocked with Argon2id.');
                this.currentKdf = 'argon2id';
                return true;
            } catch (e) {
                // Argon2id failed. This might be a legacy PBKDF2 vault.
                console.log('[Vault] Argon2id decrypt failed. Trying legacy PBKDF2...');
            }

            // 3. Try PBKDF2 (Legacy)
            const pbkdf2Key = await this.deriveKeyPBKDF2(privateKeyBytes);
            this.encryptionKey = pbkdf2Key;

            try {
                const secrets = await this.loadSecrets(); // Verify decryption
                console.log('[Vault] Unlocked with PBKDF2. Migrating to Argon2id...');

                // 4. MIGRATION: Re-encrypt with Argon2id
                this.encryptionKey = argonKey; // Switch to new key
                this.currentKdf = 'argon2id';
                await this.saveSecrets(secrets); // Save overwrites with new encryption

                console.log('[Vault] Migration successful! Upgraded to Argon2id.');
                return true;
            } catch (e) {
                console.error('[Vault] Failed to unlock with known KDFs.');
                this.encryptionKey = null;
                return false;
            }

        } catch (error) {
            console.error('Failed to initialize vault:', error);
            return false;
        }
    }

    // Encrypt a string using AES-GCM (with ROFL TEE support)
    private async encrypt(plaintext: string): Promise<EncryptedBlob> {
        if (!this.encryptionKey) {
            throw new Error('Vault not initialized');
        }

        // Use ROFL TEE encryption if available
        if (roflCore.isAvailable()) {
            try {
                const roflBlob = await roflCore.encrypt(plaintext);
                return {
                    iv: '',
                    data: '',
                    tag: '',
                    kdf: this.currentKdf,
                    rofl: roflBlob, // Store ROFL encrypted data
                };
            } catch (error) {
                console.warn('[Vault] ROFL encryption failed, falling back to local:', error);
            }
        }

        // Fallback: Local AES-GCM encryption
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            data
        );

        return {
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            tag: '', // Tag is included in ciphertext for WebCrypto AES-GCM
            kdf: this.currentKdf, // Tag the KDF version
        };
    }

    // Public wrapper for arbitrary data encryption
    async encryptData(data: string): Promise<EncryptedBlob> {
        return this.encrypt(data);
    }

    // Public wrapper for arbitrary data decryption
    async decryptData(blob: EncryptedBlob): Promise<string> {
        return this.decrypt(blob);
    }

    // Decrypt a blob using AES-GCM (with ROFL TEE support)
    private async decrypt(blob: EncryptedBlob): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Vault not initialized');
        }

        // Check if this was ROFL encrypted
        if (blob.rofl && roflCore.isAvailable()) {
            try {
                return await roflCore.decrypt(blob.rofl);
            } catch (error) {
                console.warn('[Vault] ROFL decryption failed:', error);
                throw error;
            }
        }

        // Fallback: Local AES-GCM decryption
        const iv = Uint8Array.from(atob(blob.iv), c => c.charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(blob.data), c => c.charCodeAt(0));

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    // Generate a cryptographically secure random password
    generateSecurePassword(length: number = 20, options?: {
        uppercase?: boolean;
        lowercase?: boolean;
        numbers?: boolean;
        symbols?: boolean;
    }): string {
        const opts = {
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: true,
            ...options
        };

        let charset = '';
        if (opts.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (opts.lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
        if (opts.numbers) charset += '0123456789';
        if (opts.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

        if (charset.length === 0) {
            charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        }

        const randomBytes = crypto.getRandomValues(new Uint8Array(length));
        let password = '';

        for (let i = 0; i < length; i++) {
            password += charset[randomBytes[i] % charset.length];
        }

        return password;
    }

    // Get storage usage in bytes
    getStorageUsage(): number {
        if (!this.userAddress) return 0;
        const stored = localStorage.getItem(this.getStorageKey());
        return stored ? stored.length : 0;
    }

    // Get storage key for current user
    private getStorageKey(): string {
        if (!this.userAddress) {
            throw new Error('Vault not initialized');
        }
        return `${VAULT_STORAGE_KEY}_${this.userAddress.toLowerCase()}`;
    }

    // Save encrypted secrets to localStorage
    private async saveSecrets(secrets: VaultSecret[]): Promise<void> {
        const plaintext = JSON.stringify(secrets);
        const encrypted = await this.encrypt(plaintext);
        localStorage.setItem(this.getStorageKey(), JSON.stringify(encrypted));
    }

    // Load and decrypt secrets from localStorage
    private async loadSecrets(): Promise<VaultSecret[]> {
        const stored = localStorage.getItem(this.getStorageKey());
        if (!stored) {
            return [];
        }

        try {
            const blob: EncryptedBlob = JSON.parse(stored);
            const decrypted = await this.decrypt(blob);
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Failed to load secrets:', error);
            return [];
        }
    }

    // CRUD Operations

    async getAllSecrets(): Promise<VaultSecret[]> {
        return this.loadSecrets();
    }

    async getSecret(id: string): Promise<VaultSecret | null> {
        const secrets = await this.loadSecrets();
        return secrets.find(s => s.id === id) || null;
    }

    async addSecret(secret: Omit<VaultSecret, 'id' | 'createdAt' | 'updatedAt'>): Promise<VaultSecret> {
        const secrets = await this.loadSecrets();

        const newSecret: VaultSecret = {
            ...secret,
            id: 'secret_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        secrets.push(newSecret);
        await this.saveSecrets(secrets);

        return newSecret;
    }

    async updateSecret(id: string, updates: Partial<Omit<VaultSecret, 'id' | 'createdAt'>>): Promise<VaultSecret | null> {
        const secrets = await this.loadSecrets();
        const index = secrets.findIndex(s => s.id === id);

        if (index === -1) {
            return null;
        }

        secrets[index] = {
            ...secrets[index],
            ...updates,
            updatedAt: Date.now(),
        };

        await this.saveSecrets(secrets);
        return secrets[index];
    }

    async deleteSecret(id: string): Promise<boolean> {
        const secrets = await this.loadSecrets();
        const filtered = secrets.filter(s => s.id !== id);

        if (filtered.length === secrets.length) {
            return false; // Nothing deleted
        }

        await this.saveSecrets(filtered);
        return true;
    }

    // Check if vault is initialized
    isInitialized(): boolean {
        return this.encryptionKey !== null;
    }

    // Get user address
    getAddress(): string | null {
        return this.userAddress;
    }

    // Get current KDF info
    getKdfInfo(): string {
        return this.currentKdf === 'argon2id'
            ? 'Argon2id • Memory-Hard (64MB)'
            : 'PBKDF2 • 100,000 iterations';
    }

    // Clear vault (logout)
    clear(): void {
        this.encryptionKey = null;
        this.userAddress = null;
    }

    // ==========================================
    // EXPORT / IMPORT FEATURES
    // ==========================================

    // Export encrypted vault as downloadable JSON file
    async exportVault(): Promise<void> {
        const stored = localStorage.getItem(this.getStorageKey());
        if (!stored) {
            throw new Error('No vault data to export');
        }

        const exportData = {
            version: 1,
            exportedAt: Date.now(),
            address: this.userAddress,
            encryptedVault: JSON.parse(stored),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `pribado-vault-backup-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Import vault from JSON file
    async importVault(file: File): Promise<{ success: boolean; secretCount: number }> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const importData = JSON.parse(content);

                    // Validate format
                    if (!importData.version || !importData.encryptedVault) {
                        throw new Error('Invalid vault backup format');
                    }

                    // Store the encrypted vault
                    localStorage.setItem(this.getStorageKey(), JSON.stringify(importData.encryptedVault));

                    // Try to decrypt to get count
                    const secrets = await this.loadSecrets();

                    resolve({ success: true, secretCount: secrets.length });
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // ==========================================
    // ON-CHAIN SYNC (SAPPHIRE)
    // ==========================================

    private getSyncTxKey(): string {
        return `pribado_vault_sync_tx_${this.userAddress?.toLowerCase()}`;
    }

    // Sync vault to Sapphire blockchain
    async syncToChain(): Promise<{ txHash: string; explorerUrl: string; rawData: string }> {
        if (!this.userAddress) {
            throw new Error('Vault not initialized');
        }

        const stored = localStorage.getItem(this.getStorageKey());
        if (!stored) {
            throw new Error('No vault data to sync');
        }

        // Get current network from localStorage
        const network = localStorage.getItem('pribado_network') || 'testnet';

        // Call our API to store on chain
        const response = await fetch('/api/sapphire', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'storeVault',
                network, // Include network selection
                data: {
                    encryptedVault: stored,
                    address: this.userAddress,
                    timestamp: Date.now(),
                },
            }),
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to sync to chain');
        }

        // Store tx hash and network for future retrieval
        localStorage.setItem(this.getSyncTxKey(), result.txHash);
        localStorage.setItem(this.getSyncTxKey() + '_network', network);

        return {
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            rawData: result.rawData || '',
        };
    }

    // Get the last known sync transaction hash
    getLastSyncTx(): string | null {
        if (!this.userAddress) return null;
        return localStorage.getItem(this.getSyncTxKey());
    }

    // Get the network that the last sync was made on
    getLastSyncNetwork(): 'testnet' | 'mainnet' {
        if (!this.userAddress) return 'testnet';
        const saved = localStorage.getItem(this.getSyncTxKey() + '_network');
        return saved === 'mainnet' ? 'mainnet' : 'testnet';
    }

    // Sync vault from Sapphire blockchain
    async syncFromChain(providedTxHash?: string): Promise<{ success: boolean; secretCount: number }> {
        if (!this.userAddress) {
            throw new Error('Vault not initialized');
        }

        // Get current network from localStorage
        const network = localStorage.getItem('pribado_network') || 'testnet';

        // Use provided tx hash, or local storage, or auto-discover
        let txHash = providedTxHash || localStorage.getItem(this.getSyncTxKey());
        let encryptedVault: string | null = null;

        // If no tx hash, try to auto-discover by address
        if (!txHash) {
            console.log('No local tx hash, searching blockchain for vault...');

            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'findVaultByAddress',
                    network,
                    data: { userAddress: this.userAddress },
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error('No vault backup found on blockchain for your address');
            }

            txHash = result.txHash;
            encryptedVault = result.encryptedVault;

            // Save for future use
            localStorage.setItem(this.getSyncTxKey(), txHash!);
        }

        // If we don't have encrypted vault yet, fetch it
        if (!encryptedVault) {
            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'retrieveVault',
                    network,
                    data: { txHash },
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to retrieve vault from chain');
            }

            encryptedVault = result.encryptedVault;
        }

        // Store the retrieved vault locally
        localStorage.setItem(this.getStorageKey(), encryptedVault!);

        // Save the tx hash for future use
        if (providedTxHash) {
            localStorage.setItem(this.getSyncTxKey(), providedTxHash);
        }

        // Decrypt to get count
        const secrets = await this.loadSecrets();

        return { success: true, secretCount: secrets.length };
    }

    // Check if vault has been synced to chain
    hasSyncedToChain(): boolean {
        if (!this.userAddress) return false;
        return localStorage.getItem(this.getSyncTxKey()) !== null;
    }

    // Get last sync tx hash
    getLastSyncTxHash(): string | null {
        if (!this.userAddress) return null;
        return localStorage.getItem(this.getSyncTxKey());
    }
}

// Singleton instance
export const vaultService = new VaultService();
