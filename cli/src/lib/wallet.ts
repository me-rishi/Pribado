/**
 * Wallet utilities for Pribado CLI
 * BIP-39/BIP-44 derivation matching the web app exactly
 */

import { ethers } from 'ethers';

/**
 * Generate a new BIP-39 seed phrase (12 words)
 */
export function generateSeedPhrase(): string {
    const wallet = ethers.Wallet.createRandom();
    return wallet.mnemonic!.phrase;
}

/**
 * Validate a BIP-39 seed phrase
 */
export function isValidSeedPhrase(seedPhrase: string): boolean {
    try {
        const normalized = seedPhrase.trim().toLowerCase();
        return ethers.Mnemonic.isValidMnemonic(normalized);
    } catch {
        return false;
    }
}

/**
 * Derive wallet from seed phrase
 * Uses same BIP-44 path as web app: m/44'/60'/0'/0/0
 */
export function getWalletFromSeed(seedPhrase: string): ethers.HDNodeWallet {
    const normalized = seedPhrase.trim().toLowerCase();
    const mnemonic = ethers.Mnemonic.fromPhrase(normalized);
    return ethers.HDNodeWallet.fromMnemonic(mnemonic);
}

/**
 * Get Ethereum address from seed phrase
 */
export function getAddressFromSeed(seedPhrase: string): string {
    const wallet = getWalletFromSeed(seedPhrase);
    return wallet.address;
}

/**
 * Get shortened address for display
 */
export function shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Derive enclave key from wallet (for API authentication)
 * Matches web app's enclave key derivation
 */
export async function deriveEnclaveKey(seedPhrase: string): Promise<string> {
    const wallet = getWalletFromSeed(seedPhrase);
    const enclaveMessage = 'Pribado Enclave Authentication';
    const signature = await wallet.signMessage(enclaveMessage);
    // Hash signature to get 32-byte key
    const enclaveKey = ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(2, 66);
    return enclaveKey;
}

/**
 * Calculate Proxy ID for an API key (same as web app)
 */
export async function calculateProxyId(secretId: string, privateKey: string): Promise<string> {
    const wallet = new ethers.Wallet(privateKey);
    const message = `pribado-proxy-${secretId}`;
    const signature = await wallet.signMessage(message);
    // Use first 16 bytes of keccak hash as proxy ID
    const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
    return `priv_${hash.slice(2, 34)}`;
}
