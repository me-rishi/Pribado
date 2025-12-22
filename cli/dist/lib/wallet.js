"use strict";
/**
 * Wallet utilities for Pribado CLI
 * BIP-39/BIP-44 derivation matching the web app exactly
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSeedPhrase = generateSeedPhrase;
exports.isValidSeedPhrase = isValidSeedPhrase;
exports.getWalletFromSeed = getWalletFromSeed;
exports.getAddressFromSeed = getAddressFromSeed;
exports.shortenAddress = shortenAddress;
exports.deriveEnclaveKey = deriveEnclaveKey;
exports.calculateProxyId = calculateProxyId;
const ethers_1 = require("ethers");
/**
 * Generate a new BIP-39 seed phrase (12 words)
 */
function generateSeedPhrase() {
    const wallet = ethers_1.ethers.Wallet.createRandom();
    return wallet.mnemonic.phrase;
}
/**
 * Validate a BIP-39 seed phrase
 */
function isValidSeedPhrase(seedPhrase) {
    try {
        const normalized = seedPhrase.trim().toLowerCase();
        return ethers_1.ethers.Mnemonic.isValidMnemonic(normalized);
    }
    catch {
        return false;
    }
}
/**
 * Derive wallet from seed phrase
 * Uses same BIP-44 path as web app: m/44'/60'/0'/0/0
 */
function getWalletFromSeed(seedPhrase) {
    const normalized = seedPhrase.trim().toLowerCase();
    const mnemonic = ethers_1.ethers.Mnemonic.fromPhrase(normalized);
    return ethers_1.ethers.HDNodeWallet.fromMnemonic(mnemonic);
}
/**
 * Get Ethereum address from seed phrase
 */
function getAddressFromSeed(seedPhrase) {
    const wallet = getWalletFromSeed(seedPhrase);
    return wallet.address;
}
/**
 * Get shortened address for display
 */
function shortenAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
/**
 * Derive enclave key from wallet (for API authentication)
 * Matches web app's enclave key derivation
 */
async function deriveEnclaveKey(seedPhrase) {
    const wallet = getWalletFromSeed(seedPhrase);
    const enclaveMessage = 'Pribado Enclave Authentication';
    const signature = await wallet.signMessage(enclaveMessage);
    // Hash signature to get 32-byte key
    const enclaveKey = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(signature)).slice(2, 66);
    return enclaveKey;
}
/**
 * Calculate Proxy ID for an API key (same as web app)
 */
async function calculateProxyId(secretId, privateKey) {
    const wallet = new ethers_1.ethers.Wallet(privateKey);
    const message = `pribado-proxy-${secretId}`;
    const signature = await wallet.signMessage(message);
    // Use first 16 bytes of keccak hash as proxy ID
    const hash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(signature));
    return `priv_${hash.slice(2, 34)}`;
}
//# sourceMappingURL=wallet.js.map