/**
 * Wallet utilities for Pribado CLI
 * BIP-39/BIP-44 derivation matching the web app exactly
 */
import { ethers } from 'ethers';
/**
 * Generate a new BIP-39 seed phrase (12 words)
 */
export declare function generateSeedPhrase(): string;
/**
 * Validate a BIP-39 seed phrase
 */
export declare function isValidSeedPhrase(seedPhrase: string): boolean;
/**
 * Derive wallet from seed phrase
 * Uses same BIP-44 path as web app: m/44'/60'/0'/0/0
 */
export declare function getWalletFromSeed(seedPhrase: string): ethers.HDNodeWallet;
/**
 * Get Ethereum address from seed phrase
 */
export declare function getAddressFromSeed(seedPhrase: string): string;
/**
 * Get shortened address for display
 */
export declare function shortenAddress(address: string): string;
/**
 * Derive enclave key from wallet (for API authentication)
 * Matches web app's enclave key derivation
 */
export declare function deriveEnclaveKey(seedPhrase: string): Promise<string>;
/**
 * Calculate Proxy ID for an API key (same as web app)
 */
export declare function calculateProxyId(secretId: string, privateKey: string): Promise<string>;
//# sourceMappingURL=wallet.d.ts.map