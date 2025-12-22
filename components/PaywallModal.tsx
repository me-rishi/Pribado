'use client';

import { useState, useEffect } from 'react';
import { X, Lock, Minus, Plus, Wallet, AlertCircle, ChevronDown, RefreshCw, Check } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { ethers } from 'ethers';
import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    TransactionInstruction
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface PaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DAYS_PER_DOLLAR = 30;

// EVM Networks with stablecoin addresses
const EVM_NETWORKS = [
    {
        id: 'sapphire-testnet',
        name: 'Sapphire Testnet',
        chainId: '0x5aff',
        rpcUrl: 'https://testnet.sapphire.oasis.dev',
        explorer: 'https://explorer.oasis.io/testnet/sapphire',
        nativePayment: true,
        nativeSymbol: 'ROSE',
        coingeckoId: 'oasis-network',
        logo: '/rose.webp'
    },
    {
        id: 'sapphire',
        name: 'Oasis Sapphire',
        chainId: '0x5afe',
        rpcUrl: 'https://sapphire.oasis.io',
        explorer: 'https://explorer.oasis.io/mainnet/sapphire',
        nativePayment: true,
        nativeSymbol: 'ROSE',
        coingeckoId: 'oasis-network',
        logo: '/rose.webp'
    },
    {
        id: 'base',
        name: 'Base',
        chainId: '0x2105',
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        rpcUrl: 'https://mainnet.base.org',
        explorer: 'https://basescan.org',
        logo: '/base.webp'
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        chainId: '0x1',
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        rpcUrl: 'https://eth.llamarpc.com',
        explorer: 'https://etherscan.io',
        logo: '/eth.webp'
    },
    {
        id: 'polygon',
        name: 'Polygon',
        chainId: '0x89',
        usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        rpcUrl: 'https://polygon-rpc.com',
        explorer: 'https://polygonscan.com',
        logo: '/polygon.png'
    },
    {
        id: 'arbitrum',
        name: 'Arbitrum',
        chainId: '0xa4b1',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        explorer: 'https://arbiscan.io',
        logo: '/arbitrum.jpg'
    },
    {
        id: 'optimism',
        name: 'Optimism',
        chainId: '0xa',
        usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        rpcUrl: 'https://mainnet.optimism.io',
        explorer: 'https://optimistic.etherscan.io',
        logo: '/optimism.webp'
    },
    {
        id: 'zksync',
        name: 'zkSync Era',
        chainId: '0x144',
        usdc: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
        usdt: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C',
        rpcUrl: 'https://mainnet.era.zksync.io',
        explorer: 'https://explorer.zksync.io',
        logo: '/zk.webp'
    }
];

// Solana token addresses
const SOLANA_TOKENS = {
    usdc: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    usdt: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
};

// Payment receiving addresses
const PAYMENT_WALLET_EVM = process.env.NEXT_PUBLIC_PAYMENT_WALLET || '0x8d5aDADd4a10af8D88ffa28a6D26E8ffAbda8303';
const PAYMENT_WALLET_SOL = process.env.NEXT_PUBLIC_PAYMENT_WALLET_SOL || '77LBw9nxbSP113i3av75bzKMTJG6kBVUxby6TE8LDT5S';

// Solana RPC nodes with failover support
const SOLANA_RPCS = [
    process.env.NEXT_PUBLIC_SOLANA_RPC,
    'https://solana-mainnet.publicnode.com',
    'https://solana-rpc.publicnode.com',
    'https://rpc.solana.com',
    'https://mainnet.solflare.network',
    'https://solana-mainnet.public.blastapi.io'
].filter(Boolean) as string[];

// Helper to get connection with failover
async function getSolanaBlockhash() {
    for (const rpc of SOLANA_RPCS) {
        try {
            console.log('[Solana] Trying RPC:', rpc);
            const connection = new Connection(rpc, 'confirmed');
            const { blockhash } = await connection.getLatestBlockhash('confirmed');
            return { connection, blockhash };
        } catch (err) {
            console.warn(`[Solana] RPC ${rpc} failed, trying next...`, err);
        }
    }
    throw new Error('All Solana RPC nodes failed. Please check your connection or provide a private RPC URL.');
}

function formatDays(totalDays: number): string {
    if (totalDays <= 0) return '0d';
    const years = Math.floor(totalDays / 365);
    const remainingAfterYears = totalDays % 365;
    const months = Math.floor(remainingAfterYears / 30);
    const days = remainingAfterYears % 30;
    const parts: string[] = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (days > 0 || parts.length === 0) parts.push(`${days}d`);
    return parts.join(' ');
}

type NetworkType = 'evm' | 'solana';
type TokenType = 'usdc' | 'usdt' | 'native';

// Helper to detect if we're on mobile
function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Helper to get specifically MetaMask when multiple wallets (like Phantom) are installed
async function getMetaMaskProvider() {
    if (typeof window === 'undefined') return null;

    // Check if we're in MetaMask's in-app browser
    const ethereum = (window as any).ethereum;

    // If no ethereum provider and on mobile, redirect to MetaMask app
    if (!ethereum && isMobileDevice()) {
        // Construct deep link to open this page in MetaMask browser
        const currentUrl = window.location.href;
        const metamaskDeepLink = `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`;
        window.location.href = metamaskDeepLink;
        return null;
    }

    if (!ethereum) return null;

    // If there are multiple providers, find the one that is specifically MetaMask
    if (ethereum.providers?.length) {
        return ethereum.providers.find((p: any) => p.isMetaMask) || ethereum.providers[0];
    }

    // Fallback to the main ethereum object
    return ethereum;
}

// Helper to open Phantom on mobile
function openPhantomOnMobile() {
    if (!isMobileDevice()) return false;

    const currentUrl = window.location.href;
    // Phantom deep link format
    const phantomDeepLink = `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
    window.location.href = phantomDeepLink;
    return true;
}

export default function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
    const { setSubscription, expiresAt } = useSubscription();
    const { user } = useAuth();
    const { showToast } = useToast();

    // Form state
    const [amount, setAmount] = useState(1);
    const [networkType, setNetworkType] = useState<NetworkType>('evm');
    const [selectedEvmNetwork, setSelectedEvmNetwork] = useState(EVM_NETWORKS[0]);
    const [selectedToken, setSelectedToken] = useState<TokenType>('usdc');
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Price state for native tokens
    const [nativePrices, setNativePrices] = useState<Record<string, number>>({});
    const [isPriceLoading, setIsPriceLoading] = useState(false);

    // Fetch native token prices
    const fetchPrices = async () => {
        setIsPriceLoading(true);
        try {
            const response = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=oasis-network,solana&vs_currencies=usd'
            );
            const data = await response.json();
            setNativePrices({
                rose: data['oasis-network']?.usd || 0.05,
                sol: data['solana']?.usd || 180
            });
        } catch (err) {
            console.error('[Paywall] Failed to fetch prices:', err);
            setNativePrices({ rose: 0.05, sol: 180 });
        } finally {
            setIsPriceLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchPrices();
    }, [isOpen]);

    // Reset tokens when network changes
    useEffect(() => {
        setSelectedToken('usdc');
    }, [networkType]);


    // Reset token when switching networks
    useEffect(() => {
        if (selectedEvmNetwork.nativePayment) {
            setSelectedToken('native');
        } else if (selectedToken === 'native' && networkType === 'evm') {
            setSelectedToken('usdc');
        }
    }, [selectedEvmNetwork, networkType]);

    if (!isOpen) return null;

    const totalDays = amount * DAYS_PER_DOLLAR;
    const formattedDuration = formatDays(totalDays);

    // Calculate native amounts
    const roseAmount = nativePrices.rose ? (amount / nativePrices.rose).toFixed(2) : '...';
    const solAmount = nativePrices.sol ? (amount / nativePrices.sol).toFixed(4) : '...';

    const handleAmountChange = (delta: number) => {
        setAmount(prev => Math.max(1, Math.min(100, prev + delta)));
    };

    // Get display token name
    const getTokenDisplay = () => {
        if (networkType === 'solana') {
            if (selectedToken === 'native') return `${solAmount} SOL`;
            return `$${amount} ${selectedToken.toUpperCase()}`;
        }
        if (selectedEvmNetwork.nativePayment) return `${roseAmount} ROSE`;
        return `$${amount} ${selectedToken.toUpperCase()}`;
    };

    // Handle EVM Payment
    const handleEvmPayment = async () => {
        const ethereum = await getMetaMaskProvider();
        if (!ethereum) {
            throw new Error('Please install MetaMask');
        }

        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        const payerAddress = accounts[0];

        // Switch network if needed
        const currentChainId = await ethereum.request({ method: 'eth_chainId' });
        if (currentChainId !== selectedEvmNetwork.chainId) {
            showToast(`Switching to ${selectedEvmNetwork.name}...`, 'info');
            try {
                await ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: selectedEvmNetwork.chainId }]
                });
            } catch (switchError: any) {
                if (switchError.code === 4902) {
                    const nativeCurrency = selectedEvmNetwork.nativePayment
                        ? { name: 'ROSE', symbol: 'ROSE', decimals: 18 }
                        : { name: 'ETH', symbol: 'ETH', decimals: 18 };
                    await ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: selectedEvmNetwork.chainId,
                            chainName: selectedEvmNetwork.name,
                            nativeCurrency,
                            rpcUrls: [selectedEvmNetwork.rpcUrl],
                            blockExplorerUrls: [selectedEvmNetwork.explorer]
                        }]
                    });
                } else throw switchError;
            }
        }

        let txHash: string;

        if (selectedEvmNetwork.nativePayment && nativePrices.rose) {
            const roseNeeded = amount / nativePrices.rose;
            const amountInWei = BigInt(Math.ceil(roseNeeded * 10 ** 18));
            showToast(`Please confirm ${roseNeeded.toFixed(2)} ROSE transfer...`, 'info');
            txHash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: payerAddress,
                    to: PAYMENT_WALLET_EVM,
                    value: '0x' + amountInWei.toString(16),
                    gas: '0x30D40'
                }]
            });
        } else {
            const tokenAddress = selectedToken === 'usdt'
                ? (selectedEvmNetwork as any).usdt
                : (selectedEvmNetwork as any).usdc;
            const amountInMicro = amount * 1000000;
            const amountHex = BigInt(amountInMicro).toString(16).padStart(64, '0');
            const toAddressHex = PAYMENT_WALLET_EVM.slice(2).toLowerCase().padStart(64, '0');
            const transferData = '0xa9059cbb' + toAddressHex + amountHex;

            showToast(`Please confirm ${selectedToken.toUpperCase()} transfer...`, 'info');
            txHash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: payerAddress,
                    to: tokenAddress,
                    data: transferData,
                    gas: '0x15F90'
                }]
            });
        }

        showToast('Transaction submitted! Waiting for confirmation...', 'info');
        let receipt = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            receipt = await ethereum.request({
                method: 'eth_getTransactionReceipt',
                params: [txHash]
            });
            if (receipt) break;
        }

        if (!receipt) throw new Error('Transaction timed out');
        if (receipt.status === '0x0') throw new Error('Transaction reverted');

        return txHash;
    };

    // Handle Solana Payment (Phantom)
    const handleSolanaPayment = async () => {
        const solana = (window as any).solana;

        // If on mobile and Phantom not detected, open Phantom app
        if (!solana?.isPhantom) {
            if (isMobileDevice()) {
                openPhantomOnMobile();
                throw new Error('Opening Phantom app...');
            }
            throw new Error('Please install Phantom wallet');
        }

        // Connect to Phantom
        const resp = await solana.connect();
        const payerPublicKey = resp.publicKey;

        console.log('[Solana] Connected:', payerPublicKey.toString());

        const connectionResult = await getSolanaBlockhash();
        const { connection, blockhash } = connectionResult;

        if (selectedToken === 'native') {
            // Native SOL transfer
            const solNeeded = amount / nativePrices.sol;
            const lamports = Math.ceil(solNeeded * LAMPORTS_PER_SOL);

            showToast(`Please confirm ${solNeeded.toFixed(4)} SOL transfer...`, 'info');

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: payerPublicKey,
                    toPubkey: new PublicKey(PAYMENT_WALLET_SOL),
                    lamports
                })
            );

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = payerPublicKey;

            const signedTx = await solana.signTransaction(transaction);
            const txHash = await connection.sendRawTransaction(signedTx.serialize());

            showToast('Transaction submitted! Waiting for confirmation...', 'info');
            await connection.confirmTransaction(txHash, 'confirmed');

            console.log('[Solana] Transaction confirmed:', txHash);
            return txHash;
        } else {
            // SPL Token transfer (USDC or USDT)
            const mintAddress = selectedToken === 'usdt' ? SOLANA_TOKENS.usdt : SOLANA_TOKENS.usdc;
            const amountInMicro = amount * 1000000; // 6 decimals

            showToast(`Please confirm ${selectedToken.toUpperCase()} transfer...`, 'info');

            // Helper to derive Associated Token Address (ATA)
            const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
            const getAta = async (owner: PublicKey, mint: PublicKey) => {
                const [ata] = await PublicKey.findProgramAddress(
                    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
                    ASSOCIATED_TOKEN_PROGRAM_ID
                );
                return ata;
            };

            // Get associated token addresses
            const destinationWallet = new PublicKey(PAYMENT_WALLET_SOL);
            const fromAta = await getAta(payerPublicKey, mintAddress);
            const toAta = await getAta(destinationWallet, mintAddress);

            console.log('[Solana] SPL Transfer Debug:', {
                mint: mintAddress.toString(),
                from: payerPublicKey.toString(),
                fromAta: fromAta.toString(),
                to: destinationWallet.toString(),
                toAta: toAta.toString(),
                amount: amountInMicro
            });

            // Build transfer instruction data: [1 byte instruction type, 8 byte amount (little-endian)]
            const dataBuffer = new Uint8Array(9);
            dataBuffer[0] = 3; // Transfer instruction
            const amountBigInt = BigInt(amountInMicro);
            for (let i = 0; i < 8; i++) {
                dataBuffer[1 + i] = Number((amountBigInt >> BigInt(8 * i)) & BigInt(0xff));
            }

            const transferInstruction = new TransactionInstruction({
                keys: [
                    { pubkey: fromAta, isSigner: false, isWritable: true },
                    { pubkey: toAta, isSigner: false, isWritable: true },
                    { pubkey: payerPublicKey, isSigner: true, isWritable: false }
                ],
                programId: TOKEN_PROGRAM_ID,
                data: Buffer.from(dataBuffer)
            });

            const transaction = new Transaction().add(transferInstruction);
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = payerPublicKey;

            const signedTx = await solana.signTransaction(transaction);
            const txHash = await connection.sendRawTransaction(signedTx.serialize());

            showToast('Transaction submitted! Waiting for confirmation...', 'info');
            await connection.confirmTransaction(txHash, 'confirmed');

            console.log('[Solana] SPL Token transfer confirmed:', txHash);
            return txHash;
        }
    };


    const handlePaymentSuccess = async (txHash?: string) => {
        const now = Date.now();
        const currentExpiry = expiresAt && expiresAt > now ? expiresAt : now;
        const newExpiresAt = currentExpiry + (totalDays * 24 * 60 * 60 * 1000);
        setSubscription(newExpiresAt);

        const action = txHash ? {
            label: 'View Transaction',
            onClick: () => {
                const url = networkType === 'solana'
                    ? `https://solscan.io/tx/${txHash}`
                    : `${selectedEvmNetwork.explorer}/tx/${txHash}`;
                window.open(url, '_blank');
            }
        } : undefined;

        showToast(`Payment verified! +${formattedDuration} added.`, 'success', action);
        onClose();
    };

    const handlePayment = async () => {
        if (!user?.address && networkType === 'evm') {
            showToast('Please connect your wallet first', 'error');
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const txHash = networkType === 'solana'
                ? await handleSolanaPayment()
                : await handleEvmPayment();

            await handlePaymentSuccess(txHash);

        } catch (err: any) {
            console.error('[Paywall] Payment error:', err);
            if (err.code === 4001 || err.message?.includes('User rejected')) {
                setError('Transaction cancelled');
            } else {
                setError(err.message || 'Payment failed');
            }
            showToast(err.message || 'Payment failed', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative flex flex-col items-center justify-center max-w-xs w-full transition-all duration-500">

                {/* Standard Checkout Card */}
                <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-xs overflow-hidden shadow-2xl animate-fade-in z-20">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-500/20 to-emerald-500/20 px-5 py-2 border-b border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold text-zinc-50">Mainnet Access</h2>
                                <p className="text-[10px] text-zinc-400 font-medium">$1 = 30 days</p>
                            </div>
                            <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        {/* Configuration Check */}
                        {!PAYMENT_WALLET_EVM && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 flex items-center gap-2 mb-2">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="text-[10px] text-amber-400 font-bold uppercase">Configuration Error: Payment Wallet Missing</span>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                <span className="text-xs text-red-400">{error}</span>
                            </div>
                        )}

                        {/* Network Type Toggle */}
                        <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg">
                            <button
                                onClick={() => { setNetworkType('evm'); setSelectedToken('usdc'); }}
                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${networkType === 'evm' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                EVM
                            </button>
                            <button
                                onClick={() => { setNetworkType('solana'); setSelectedToken('usdc'); }}
                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${networkType === 'solana' ? 'bg-purple-500/20 text-purple-400' : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                Solana
                            </button>
                        </div>

                        {/* Network Selector (EVM only) */}
                        {networkType === 'evm' && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                                    disabled={isProcessing}
                                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 flex items-center justify-between hover:border-zinc-600 transition-colors disabled:opacity-50"
                                >
                                    <span className="text-sm text-zinc-200">{selectedEvmNetwork.name}</span>
                                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showNetworkDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showNetworkDropdown && (
                                    <div
                                        className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-10 shadow-xl max-h-48 overflow-y-scroll"
                                        style={{
                                            scrollbarWidth: 'thin',
                                            scrollbarColor: '#3f3f46 transparent'
                                        }}
                                    >
                                        {EVM_NETWORKS.map(network => (
                                            <button
                                                key={network.id}
                                                onClick={() => {
                                                    setSelectedEvmNetwork(network);
                                                    setShowNetworkDropdown(false);
                                                }}
                                                className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 transition-colors flex items-center gap-2.5 ${selectedEvmNetwork.id === network.id ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-300'
                                                    }`}
                                            >
                                                <img src={network.logo} alt={network.name} className="w-5 h-5 rounded-full object-cover" />
                                                {network.name}
                                                {network.nativePayment && <span className="ml-auto text-[10px] text-pink-400">(ROSE)</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Token Selector */}
                        {(networkType === 'solana' || !selectedEvmNetwork.nativePayment) && (
                            <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg">
                                {networkType === 'solana' && (
                                    <button
                                        onClick={() => setSelectedToken('native')}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${selectedToken === 'native' ? 'bg-purple-500/20 text-purple-400' : 'text-zinc-400'
                                            }`}
                                    >
                                        SOL
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedToken('usdc')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${selectedToken === 'usdc' ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400'
                                        }`}
                                >
                                    USDC
                                </button>
                                <button
                                    onClick={() => setSelectedToken('usdt')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${selectedToken === 'usdt' ? 'bg-green-500/20 text-green-400' : 'text-zinc-400'
                                        }`}
                                >
                                    USDT
                                </button>
                            </div>
                        )}

                        {/* Amount Selector */}
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3">
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={() => handleAmountChange(-1)}
                                    disabled={isProcessing}
                                    className="w-9 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 flex items-center justify-center transition-colors"
                                >
                                    <Minus className="w-4 h-4 text-zinc-300" />
                                </button>

                                <div className="text-center min-w-[80px]">
                                    <div className="text-3xl font-bold text-zinc-50">${amount}</div>
                                    <span className="text-xs text-zinc-400">{getTokenDisplay()}</span>
                                </div>

                                <button
                                    onClick={() => handleAmountChange(1)}
                                    disabled={isProcessing}
                                    className="w-9 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 flex items-center justify-center transition-colors"
                                >
                                    <Plus className="w-4 h-4 text-zinc-300" />
                                </button>
                            </div>

                            <div className="mt-3 text-center">
                                <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                                    {formattedDuration}
                                </span>
                                <span className="text-zinc-500 text-xs ml-1">({totalDays} days)</span>
                            </div>

                            <div className="flex gap-1.5 mt-3">
                                {[1, 5, 10, 20].map(val => (
                                    <button
                                        key={val}
                                        onClick={() => setAmount(val)}
                                        disabled={isProcessing}
                                        className={`flex-1 py-1 rounded text-xs font-medium transition-all disabled:opacity-50 ${amount === val ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700'
                                            }`}
                                    >
                                        ${val}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action Area */}
                        <div className="space-y-3">
                            <button
                                onClick={handlePayment}
                                disabled={isProcessing || isPriceLoading}
                                className="w-full py-3.5 bg-white hover:bg-zinc-100 text-zinc-900 font-black text-xs uppercase tracking-[0.15em] rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50 active:scale-[0.98]"
                            >
                                {isProcessing ? (
                                    <div className="w-4 h-4 border-2 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Wallet className="w-4 h-4" />
                                        Pay {getTokenDisplay()}
                                    </>
                                )}
                            </button>

                            <div className="flex items-center justify-center gap-2 opacity-80 pt-1 border-t border-zinc-800/50">
                                <a
                                    href="https://www.x402.org/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[8px] font-black uppercase tracking-widest bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent hover:from-emerald-300 hover:to-green-400 transition-all"
                                >
                                    x402 Protocol Secured
                                </a>
                                <div className="w-1 h-1 bg-zinc-700 rounded-full" />
                                <p className={`text-[8px] font-black uppercase tracking-widest ${networkType === 'solana' ? 'text-violet-400' : 'text-orange-400'}`}>
                                    {networkType === 'solana' ? 'Phantom' : 'MetaMask'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
