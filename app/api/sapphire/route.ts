import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { serverEnclave } from '@/services/serverEnclave';
import { checkRateLimit, GAS_ACTIONS } from '@/services/rateLimit';
import db, { createDocument, getDocumentsByOwner, kvGet, kvSet } from '@/services/db';

// Network configurations
const NETWORKS = {
    testnet: {
        rpc: 'https://testnet.sapphire.oasis.dev',
        explorer: 'https://explorer.oasis.io/testnet/sapphire/tx'
    },
    mainnet: {
        rpc: 'https://sapphire.oasis.io',
        explorer: 'https://explorer.oasis.io/mainnet/sapphire/tx'
    }
};

type NetworkType = 'testnet' | 'mainnet';

// Allowed origins - ONLY production domain
const ALLOWED_ORIGINS = [
    'https://pribado.dev'
];

// Helper to get documents (replaces readLedger for emails)
function getEmails(owner?: string) {
    if (owner) {
        return getDocumentsByOwner(owner);
    }
    const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
    return stmt.all();
}

// Helper to get vault backup
function getVaultBackup(address: string) {
    const key = `vault_backup_${address.toLowerCase()}`;
    const data = kvGet(key);
    return data ? JSON.parse(data) : null;
}

// Helper to store vault backup
function storeVaultBackupKV(address: string, encryptedVault: string, timestamp: number, txHash?: string) {
    const key = `vault_backup_${address.toLowerCase()}`;
    kvSet(key, JSON.stringify({ encryptedVault, timestamp, txHash }));
}

// Compatibility layer for backward compatibility
// Reads from SQLite but returns ledger-like structure
function readLedger() {
    const emails = getEmails() as any[];
    const backupsRaw = db.prepare("SELECT key, value FROM kv_store WHERE key LIKE 'mail_backup_%'").all() as any[];
    const vaultsRaw = db.prepare("SELECT key, value FROM kv_store WHERE key LIKE 'vault_backup_%'").all() as any[];

    const backups: Record<string, any> = {};
    for (const b of backupsRaw) {
        const addr = b.key.replace('mail_backup_', '');
        backups[addr] = JSON.parse(b.value);
    }

    const vaults: Record<string, any> = {};
    for (const v of vaultsRaw) {
        const addr = v.key.replace('vault_backup_', '');
        vaults[addr] = JSON.parse(v.value);
    }

    return { emails, backups, vaults };
}

// Write ledger (for backward compat - writes to SQLite)
function writeLedger(data: { emails?: any[]; backups?: Record<string, any>; vaults?: Record<string, any> }) {
    // Note: emails are written via createDocument directly
    // This only handles backups and vaults
    if (data.backups) {
        for (const [addr, backup] of Object.entries(data.backups)) {
            const key = `mail_backup_${addr}`;
            kvSet(key, JSON.stringify(backup));
        }
    }
    if (data.vaults) {
        for (const [addr, vault] of Object.entries(data.vaults)) {
            const key = `vault_backup_${addr.toLowerCase()}`;
            kvSet(key, JSON.stringify(vault));
        }
    }
}

export async function POST(req: NextRequest) {
    try {
        // ============================================
        // SECURITY: Origin Check
        // ============================================
        const origin = req.headers.get('origin') || '';
        const referer = req.headers.get('referer') || '';

        const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed =>
            origin.startsWith(allowed) || referer.startsWith(allowed)
        );

        // In production, require valid origin
        if (process.env.NODE_ENV === 'production' && !isAllowedOrigin) {
            console.warn(`[Sapphire] Blocked request from origin: ${origin}`);
            return NextResponse.json({ error: 'Forbidden - Invalid origin' }, { status: 403 });
        }

        const body = await req.json();
        const { action, data, network: requestNetwork } = body;

        // Get network from request or default to testnet
        const network: NetworkType = (requestNetwork === 'mainnet') ? 'mainnet' : 'testnet';
        const networkConfig = NETWORKS[network];
        console.log(`[Sapphire] Using network: ${network} (${networkConfig.rpc})`);


        // ============================================
        // SECURITY: Validate action
        // ============================================
        const validActions = ['storeEmail', 'storeMailBackup', 'findMailBackupByAddress',
            'storeVault', 'retrieveVault', 'findVaultByAddress'];
        if (!validActions.includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // ============================================
        // SECURITY: Rate Limiting (per wallet address)
        // ============================================
        // Get wallet address from request data or enclave session
        const walletAddress = data?.signerAddress ||
            data?.address ||
            data?.userAddress ||
            serverEnclave.getOwner?.() ||
            req.headers.get('x-enclave-owner') ||
            'unknown';

        const rateCheck = checkRateLimit(walletAddress, action);
        if (!rateCheck.allowed) {
            console.warn(`[Sapphire] Rate limit hit for ${walletAddress} on action: ${action}`);
            return NextResponse.json({ error: rateCheck.error }, { status: 429 });
        }

        // ============================================
        // SECURITY: Require Enclave Auth for Gas Actions
        // ============================================
        if (GAS_ACTIONS.includes(action)) {
            if (!serverEnclave.isUnlocked()) {
                return NextResponse.json({
                    error: 'Authentication required. Please unlock your vault first.'
                }, { status: 401 });
            }
        }

        // Using SQLite database instead of JSON ledger
        const ledger = readLedger();

        if (action === 'storeEmail') {
            const { emailId, encryptedData, metadata, note, signerAddress } = data;

            // Real Blockchain Interaction
            let txHash = null;
            let explorerUrl = null;

            if (process.env.SAPPHIRE_PRIVATE_KEY) {
                try {
                    console.log('[Sapphire] Initiating real blockchain transaction...');

                    // Use wrapEthereumProvider (confirmed from DEBUG output)
                    const provider = sapphire.wrapEthereumProvider(new ethers.JsonRpcProvider(networkConfig.rpc) as any) as any;
                    const wallet = new ethers.Wallet(process.env.SAPPHIRE_PRIVATE_KEY, provider as any);

                    // Generate the exact filename that matches "Download Signed Doc"
                    const documentName = metadata?.name || 'document';
                    const signedFilename = `signed-${documentName.replace(/\.[^/.]+$/, '')}-${Date.now()}.png`;

                    // Create transaction data (Anchor the full document info + signer address)
                    // signer = User's vault address (who signed), NOT the gas-paying wallet
                    const payload = JSON.stringify({
                        emailId,
                        signer: signerAddress || 'unknown', // User's vault address
                        documentName,
                        signedFilename,
                        note: note || null,
                        timestamp: Date.now()
                    });
                    const hexData = ethers.hexlify(ethers.toUtf8Bytes(payload));

                    // Send transaction (Self-send with data)
                    const tx = await wallet.sendTransaction({
                        to: wallet.address, // Send to self
                        value: 0,
                        data: hexData
                    });

                    console.log('[Sapphire] Transaction sent:', tx.hash);

                    // Wait for confirmation (1 block)
                    await tx.wait(1);

                    txHash = tx.hash;
                    explorerUrl = `${networkConfig.explorer}/${txHash}`;

                } catch (error) {
                    console.error('[Sapphire] Blockchain transaction failed:', error);
                    throw new Error('Blockchain Transaction Failed: ' + (error as any).message);
                }
            } else {
                console.warn('[Sapphire] No Private Key provided. Skipping on-chain anchoring.');
            }

            // Store document in SQLite
            createDocument({
                id: emailId,
                owner: signerAddress || 'unknown',
                encrypted_data: JSON.stringify(encryptedData),
                document_hash: metadata?.hash,
                tx_hash: txHash || undefined,
                signature: metadata?.signature,
                network: network
            });

            return NextResponse.json({
                success: true,
                txHash,
                explorerUrl
            });
        }

        if (action === 'storeMailBackup') {
            const { encryptedMail, address } = data;
            const txHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');

            ledger.backups[address] = {
                encryptedMail,
                timestamp: Date.now(),
                txHash
            };

            writeLedger(ledger);

            return NextResponse.json({ success: true, txHash });
        }

        if (action === 'findMailBackupByAddress') {
            const { userAddress } = data;
            const backup = ledger.backups[userAddress];

            if (!backup) {
                return NextResponse.json({ success: false, error: 'No mail backup found' });
            }

            return NextResponse.json({
                success: true,
                encryptedMail: backup.encryptedMail,
                timestamp: backup.timestamp,
                txHash: backup.txHash
            });
        }

        // Vault backup actions
        if (action === 'storeVault') {
            const { encryptedVault, address, timestamp } = data;

            // Initialize vaults storage if not exists
            if (!ledger.vaults) ledger.vaults = {};

            // Real Blockchain Interaction
            let txHash = null;
            let explorerUrl = null;
            let rawData = null;

            if (process.env.SAPPHIRE_PRIVATE_KEY) {
                try {
                    console.log('[Sapphire] Initiating vault backup transaction...');

                    // Use Sapphire TEE-wrapped provider
                    const provider = sapphire.wrapEthereumProvider(new ethers.JsonRpcProvider(networkConfig.rpc) as any) as any;
                    const wallet = new ethers.Wallet(process.env.SAPPHIRE_PRIVATE_KEY, provider as any);

                    // Create vault backup payload with FULL encrypted vault data
                    const payload = JSON.stringify({
                        type: 'vault_backup',
                        owner: address,
                        encryptedVault: encryptedVault, // Full encrypted vault data
                        timestamp: timestamp || Date.now()
                    });
                    const hexData = ethers.hexlify(ethers.toUtf8Bytes(payload));
                    rawData = hexData; // Store for return

                    // Send transaction to Sapphire TEE
                    const tx = await wallet.sendTransaction({
                        to: wallet.address,
                        value: 0,
                        data: hexData
                    });

                    console.log('[Sapphire] Vault backup transaction sent:', tx.hash);

                    // Wait for confirmation
                    await tx.wait(1);

                    txHash = tx.hash;
                    explorerUrl = `${networkConfig.explorer}/${txHash}`;

                } catch (error) {
                    console.error('[Sapphire] Vault backup transaction failed:', error);
                    throw new Error('Blockchain Transaction Failed: ' + (error as any).message);
                }
            } else {
                throw new Error('No Sapphire private key configured. Cannot backup to blockchain.');
            }

            // Store vault backup locally as well
            ledger.vaults[address.toLowerCase()] = {
                encryptedVault,
                timestamp,
                txHash
            };

            writeLedger(ledger);

            return NextResponse.json({
                success: true,
                txHash,
                explorerUrl,
                rawData
            });
        }

        if (action === 'retrieveVault') {
            const { txHash } = data;

            if (!process.env.SAPPHIRE_PRIVATE_KEY) {
                throw new Error('No Sapphire private key configured');
            }

            try {
                console.log('[Sapphire] Retrieving vault from blockchain txHash:', txHash);

                // Query the actual blockchain
                const provider = sapphire.wrapEthereumProvider(
                    new ethers.JsonRpcProvider(networkConfig.rpc) as any
                ) as any;

                // Get the transaction
                const tx = await provider.getTransaction(txHash);
                if (!tx) {
                    return NextResponse.json({ success: false, error: 'Transaction not found on blockchain' });
                }

                // Decode the raw data
                const rawDataHex = tx.data;
                const rawDataBytes = ethers.toUtf8String(rawDataHex);
                const payload = JSON.parse(rawDataBytes);

                if (payload.type !== 'vault_backup') {
                    return NextResponse.json({ success: false, error: 'Transaction is not a vault backup' });
                }

                console.log('[Sapphire] Successfully retrieved vault from blockchain');

                return NextResponse.json({
                    success: true,
                    encryptedVault: payload.encryptedVault,
                    timestamp: payload.timestamp,
                    owner: payload.owner
                });

            } catch (error) {
                console.error('[Sapphire] Failed to retrieve vault from blockchain:', error);
                return NextResponse.json({ success: false, error: 'Failed to retrieve vault: ' + (error as any).message });
            }
        }

        if (action === 'findVaultByAddress') {
            const { userAddress } = data;

            if (!process.env.SAPPHIRE_PRIVATE_KEY) {
                throw new Error('No Sapphire private key configured');
            }

            try {
                console.log('[Sapphire] Searching blockchain for vault of address:', userAddress);
                console.log('[Sapphire] Using network:', network, networkConfig.rpc);

                // Query the blockchain - get recent transactions from our wallet
                const provider = sapphire.wrapEthereumProvider(
                    new ethers.JsonRpcProvider(networkConfig.rpc) as any
                ) as any;
                const wallet = new ethers.Wallet(process.env.SAPPHIRE_PRIVATE_KEY, provider as any);

                // Get the wallet's nonce (total transactions sent)
                const nonce = await provider.getTransactionCount(wallet.address);
                console.log(`[Sapphire] Gas wallet ${wallet.address} has sent ${nonce} transactions`);

                if (nonce === 0) {
                    return NextResponse.json({
                        success: false,
                        error: 'No vault backup found on blockchain for your address'
                    });
                }

                // Get the latest block number and scan backwards
                const latestBlock = await provider.getBlockNumber();
                const searchBlocks = Math.min(5000, latestBlock); // Search up to 5000 blocks
                const startBlock = Math.max(0, latestBlock - searchBlocks);

                console.log(`[Sapphire] Scanning blocks ${startBlock} to ${latestBlock} for vault backups...`);

                // Scan blocks for transactions from our wallet
                let foundVault = null;
                let foundTxHash = null;
                let foundTimestamp = 0;

                // Try to find vault from local ledger first (fast path)
                if (ledger.vaults && ledger.vaults[userAddress.toLowerCase()]) {
                    const localVault = ledger.vaults[userAddress.toLowerCase()];
                    const txHash = localVault.txHash;

                    try {
                        const tx = await provider.getTransaction(txHash);
                        if (tx) {
                            const rawDataBytes = ethers.toUtf8String(tx.data);
                            const payload = JSON.parse(rawDataBytes);

                            if (payload.type === 'vault_backup' &&
                                payload.owner.toLowerCase() === userAddress.toLowerCase()) {
                                console.log('[Sapphire] Found vault via stored txHash (fast path)');
                                return NextResponse.json({
                                    success: true,
                                    encryptedVault: payload.encryptedVault,
                                    timestamp: payload.timestamp,
                                    txHash: txHash
                                });
                            }
                        }
                    } catch (e) {
                        console.log('[Sapphire] Stored txHash not valid, scanning blockchain...');
                    }
                }

                // Slow path: Scan recent blocks for vault transactions
                // We look for transactions TO our own wallet (self-sends used for data storage)
                for (let blockNum = latestBlock; blockNum >= startBlock; blockNum -= 50) {
                    try {
                        const blockEnd = blockNum;
                        const blockStart = Math.max(startBlock, blockNum - 49);

                        // Use batch requests for efficiency
                        for (let b = blockEnd; b >= blockStart; b--) {
                            try {
                                const block = await provider.getBlock(b, true);
                                if (!block || !block.transactions) continue;

                                for (const txData of block.transactions) {
                                    // Only check self-sends from our gas wallet
                                    if (typeof txData === 'string') continue;
                                    const tx = txData as any;

                                    if (tx.from?.toLowerCase() !== wallet.address.toLowerCase()) continue;
                                    if (tx.to?.toLowerCase() !== wallet.address.toLowerCase()) continue;
                                    if (!tx.data || tx.data === '0x') continue;

                                    try {
                                        const rawDataBytes = ethers.toUtf8String(tx.data);
                                        const payload = JSON.parse(rawDataBytes);

                                        if (payload.type === 'vault_backup' &&
                                            payload.owner?.toLowerCase() === userAddress.toLowerCase()) {
                                            // Found a match! Keep the most recent one
                                            if (payload.timestamp > foundTimestamp) {
                                                foundVault = payload.encryptedVault;
                                                foundTxHash = tx.hash;
                                                foundTimestamp = payload.timestamp;
                                                console.log(`[Sapphire] Found vault backup at block ${b}, tx ${tx.hash}`);
                                            }
                                        }
                                    } catch {
                                        // Not a valid JSON payload, skip
                                    }
                                }
                            } catch (blockErr) {
                                // Skip problematic blocks
                            }
                        }

                        // If we found a vault, we can stop early
                        if (foundVault) {
                            console.log('[Sapphire] Found vault, stopping scan');
                            break;
                        }
                    } catch (rangeErr) {
                        console.log(`[Sapphire] Error scanning block range, continuing...`);
                    }
                }

                if (foundVault && foundTxHash) {
                    // Update local ledger for faster future lookups
                    if (!ledger.vaults) ledger.vaults = {};
                    ledger.vaults[userAddress.toLowerCase()] = {
                        encryptedVault: foundVault,
                        timestamp: foundTimestamp,
                        txHash: foundTxHash
                    };
                    writeLedger(ledger);

                    return NextResponse.json({
                        success: true,
                        encryptedVault: foundVault,
                        timestamp: foundTimestamp,
                        txHash: foundTxHash
                    });
                }

                // Not found after scanning
                return NextResponse.json({
                    success: false,
                    error: 'No vault backup found on blockchain for your address'
                });

            } catch (error) {
                console.error('[Sapphire] Failed to find vault on blockchain:', error);
                return NextResponse.json({ success: false, error: 'Failed to search blockchain: ' + (error as any).message });
            }
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Sapphire API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
