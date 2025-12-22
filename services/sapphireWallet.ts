// Oasis Sapphire Wallet Service
// Uses private key directly (no MetaMask required)

import { ethers } from 'ethers';

// Sapphire Testnet Configuration
const SAPPHIRE_TESTNET_RPC = process.env.SAPPHIRE_RPC_URL || 'https://testnet.sapphire.oasis.dev';
const SAPPHIRE_TESTNET_CHAIN_ID = 0x5aff; // 23295

export interface SapphireWallet {
    address: string;
    provider: ethers.JsonRpcProvider;
    signer: ethers.Wallet;
}

export class SapphireWalletService {
    private wallet: SapphireWallet | null = null;
    private privateKey: string | null = null;

    constructor() {
        console.log('Initializing Sapphire Wallet Service...');
    }

    // Initialize wallet with private key
    async initialize(privateKey: string): Promise<SapphireWallet> {
        try {
            // Ensure private key has 0x prefix
            const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
            this.privateKey = formattedKey;

            // Create provider for Sapphire Testnet
            const provider = new ethers.JsonRpcProvider(SAPPHIRE_TESTNET_RPC, {
                name: 'sapphire-testnet',
                chainId: SAPPHIRE_TESTNET_CHAIN_ID,
            });

            // Create wallet from private key
            const signer = new ethers.Wallet(formattedKey, provider);

            this.wallet = {
                address: signer.address,
                provider,
                signer,
            };

            console.log('Sapphire Wallet initialized:', this.wallet.address);
            return this.wallet;
        } catch (error) {
            console.error('Failed to initialize Sapphire wallet:', error);
            throw error;
        }
    }

    // Get wallet address
    getAddress(): string | null {
        return this.wallet?.address || null;
    }

    // Check wallet balance
    async getBalance(): Promise<string> {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        const balance = await this.wallet.provider.getBalance(this.wallet.address);
        return ethers.formatEther(balance);
    }

    // Send a simple transaction (for testing)
    async sendTransaction(to: string, valueInEther: string): Promise<ethers.TransactionReceipt> {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        const tx = await this.wallet.signer.sendTransaction({
            to,
            value: ethers.parseEther(valueInEther),
        });

        console.log('Transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt?.hash);

        return receipt!;
    }

    // Store encrypted data on-chain (returns transaction hash)
    async storeEncryptedData(data: string): Promise<{ txHash: string; blockNumber: number }> {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        // Encode the data as transaction data
        const encodedData = ethers.hexlify(ethers.toUtf8Bytes(data));

        const tx = await this.wallet.signer.sendTransaction({
            to: this.wallet.address, // Send to self
            value: 0,
            data: encodedData,
        });

        console.log('Data storage transaction sent:', tx.hash);
        const receipt = await tx.wait();

        return {
            txHash: receipt!.hash,
            blockNumber: receipt!.blockNumber,
        };
    }

    // Get transaction details
    async getTransaction(txHash: string): Promise<ethers.TransactionResponse | null> {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        return await this.wallet.provider.getTransaction(txHash);
    }

    // Check if wallet is initialized
    isInitialized(): boolean {
        return this.wallet !== null;
    }

    // Get explorer URL for a transaction
    getExplorerUrl(txHash: string): string {
        return `https://explorer.oasis.io/testnet/sapphire/tx/${txHash}`;
    }
}

// Singleton instance
export const sapphireWallet = new SapphireWalletService();
