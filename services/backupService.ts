
import { vaultService, EncryptedBlob } from './vaultService';

export interface BackupData {
    version: number;
    timestamp: number;
    address: string | null;
    vault: {
        secrets: any[];
    };
    mail: {
        emails: any[];
        drafts: any[];
        aliases: any; // rofl_aliases map
    };
    history: {
        logs: any[];
        stats: any;
    };
    settings?: any;
}

export interface EncryptedBackup {
    version: number;
    timestamp: number;
    address: string;
    encryptedPayload: EncryptedBlob;
}

export class BackupService {

    // Helper: Derive key from password (PBKDF2)
    private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt as any,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Helper: Encrypt string with password
    private async encryptWithPassword(data: string, password: string): Promise<string> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKeyFromPassword(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            new TextEncoder().encode(data)
        );

        // Pack: salt + iv + ciphertext
        // We'll base64 encode individually for a cleaner JSON wrapper structure
        return JSON.stringify({
            kdf: 'pbkdf2',
            salt: btoa(String.fromCharCode(...salt)),
            iv: btoa(String.fromCharCode(...iv)),
            data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
        });
    }

    // Helper: Decrypt string with password
    private async decryptWithPassword(packedData: string, password: string): Promise<string> {
        try {
            const { salt, iv, data } = JSON.parse(packedData);

            const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
            const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
            const ciphertext = Uint8Array.from(atob(data), c => c.charCodeAt(0));

            const key = await this.deriveKeyFromPassword(password, saltBytes);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivBytes },
                key,
                ciphertext
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            throw new Error('Invalid password or corrupted file');
        }
    }

    // Create a full encrypted backup of the application state
    async createBackup(password?: string): Promise<any> { // Returns Wrapped Backup or EncryptedBackup
        if (!vaultService.isInitialized()) {
            throw new Error('Vault must be unlocked to create a backup');
        }

        const address = vaultService.getAddress();
        if (!address) throw new Error('User address not found');

        // 1. Gather Local Data
        const secrets = await vaultService.getAllSecrets();
        const emails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
        const drafts = JSON.parse(localStorage.getItem('rofl_drafts') || '[]');
        const aliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');

        // 2. Fetch Server Data (Best Effort)
        let logs: any[] = [];
        let stats: any = {};

        try {
            const enclaveKey = sessionStorage.getItem('pribado_enclave_key');
            const authData = sessionStorage.getItem('pribado_auth');
            const owner = authData ? JSON.parse(authData).address : '';

            if (enclaveKey && owner) {
                const headers = {
                    'x-enclave-key': enclaveKey,
                    'x-enclave-owner': owner
                };

                const [auditRes, statsRes] = await Promise.all([
                    fetch('/api/audit', { headers }),
                    fetch('/api/stats', { headers })
                ]);

                if (auditRes.ok) {
                    const auditData = await auditRes.json();
                    logs = auditData.logs || [];
                }
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    stats = statsData || {};
                }
            }
        } catch (e) {
            console.warn('Failed to fetch server data for backup', e);
        }

        const settings = {};

        // 3. Construct Payload
        const backupPayload: BackupData = {
            version: 2,
            timestamp: Date.now(),
            address: address,
            vault: { secrets },
            mail: { emails, drafts, aliases },
            history: { logs, stats },
            settings
        };

        // 4. Encrypt Entire Payload (Inner Layer - Wallet Bound)
        const jsonPayload = JSON.stringify(backupPayload);
        const encryptedPayload = await vaultService.encryptData(jsonPayload);

        const baseBackup: EncryptedBackup = {
            version: 2,
            timestamp: Date.now(),
            address: address,
            encryptedPayload
        };

        // 5. Wrap with Password if provided (Outer Layer)
        if (password) {
            const wrapped = await this.encryptWithPassword(JSON.stringify(baseBackup), password);
            return {
                // CRITICAL: Do NOT spread ...baseBackup here. It contains 'encryptedPayload' 
                // which would bypass the password protection if exposed.
                // We only expose metadata safe for public view (version).
                isPasswordProtected: true,
                version: 2,
                timestamp: Date.now(),
                // Removed address to prevent metadata leak: address: baseBackup.address, 
                data: wrapped
            };
        }

        return baseBackup;
    }

    // Restore from an encrypted backup
    async restoreBackup(file: File, password?: string): Promise<{ success: boolean; stats: any }> {
        if (!vaultService.isInitialized()) {
            throw new Error('Vault must be unlocked to restore a backup');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    let backupObj = JSON.parse(content);

                    // 0. Handle Password Protection
                    if (backupObj.isPasswordProtected) {
                        if (!password) {
                            throw new Error('This backup is password protected. Please enter password.');
                        }
                        const decryptedInner = await this.decryptWithPassword(backupObj.data, password);
                        backupObj = JSON.parse(decryptedInner); // Now we have the EncryptedBackup
                    }

                    const backup: EncryptedBackup = backupObj;

                    // Validate basic structure
                    if (!backup.encryptedPayload || !backup.version) {
                        // Anti-tamper check: If user renamed flag or it's missing, but structure is invalid
                        if (backupObj.data && !backupObj.encryptedPayload) {
                            throw new Error('Security Alert: File appears tampered. Password protection flag missing but payload is encrypted.');
                        }
                        throw new Error('Invalid backup format');
                    }

                    // 1. Security Check: Validate Outer Address Metadata (of the decrypted layer)
                    const activeWalletAddress = vaultService.getAddress();
                    // Debugging for user report "even if they match!"
                    if (backup.address && activeWalletAddress) {
                        const normalizedBackup = backup.address.trim().toLowerCase();
                        const normalizedActive = activeWalletAddress.trim().toLowerCase();

                        if (normalizedBackup !== normalizedActive) {
                            console.error('[Restore Security Debug] Mismatch:', {
                                backup: normalizedBackup,
                                active: normalizedActive,
                                rawBackup: backup.address,
                                rawActive: activeWalletAddress
                            });
                            throw new Error(`Security Alert: Backup file identifier (${backup.address.slice(0, 6)}...) does not match your wallet. Restore rejected.`);
                        }
                    } else if (backup.address && !activeWalletAddress) {
                        throw new Error('Security Alert: No active wallet found to validate backup ownership.');
                    }

                    // 2. Decrypt Payload (Inner Layer - Wallet Bound)
                    const decryptedJson = await vaultService.decryptData(backup.encryptedPayload);
                    const data: BackupData = JSON.parse(decryptedJson);

                    // 3. Validate Address Match (Inner Payload)
                    if (data.address && activeWalletAddress) {
                        const normalizedInner = data.address.trim().toLowerCase();
                        const normalizedActive = activeWalletAddress.trim().toLowerCase();

                        if (normalizedInner !== normalizedActive) {
                            console.error('[Restore Security Debug] Inner Payload Mismatch:', {
                                inner: normalizedInner,
                                active: normalizedActive
                            });
                            throw new Error(`Inner payload belongs to a different wallet (${data.address.slice(0, 6)}...). Restore rejected.`);
                        }
                    } else if (data.address && !activeWalletAddress) {
                        throw new Error('Security Alert: No active wallet found to validate inner payload.');
                    }

                    // 4. Restore Data

                    // Vault
                    let secretsRestored = 0;
                    const currentSecrets = await vaultService.getAllSecrets();
                    const existingIds = new Set(currentSecrets.map(s => s.id));

                    for (const secret of data.vault.secrets) {
                        if (!existingIds.has(secret.id)) {
                            await vaultService.addSecret(secret);
                            secretsRestored++;
                        }
                    }

                    // Mail (Emails)
                    const currentEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
                    const emailIds = new Set(currentEmails.map((e: any) => e.id));
                    let emailsRestored = 0;

                    for (const email of data.mail.emails) {
                        if (!emailIds.has(email.id)) {
                            currentEmails.push(email);
                            emailsRestored++;
                        }
                    }
                    localStorage.setItem('rofl_emails', JSON.stringify(currentEmails));

                    // Mail (Drafts)
                    const currentDrafts = JSON.parse(localStorage.getItem('rofl_drafts') || '[]');
                    const draftIds = new Set(currentDrafts.map((d: any) => d.id));
                    let draftsRestored = 0;

                    for (const draft of data.mail.drafts) {
                        if (!draftIds.has(draft.id)) {
                            currentDrafts.push(draft);
                            draftsRestored++;
                        }
                    }
                    localStorage.setItem('rofl_drafts', JSON.stringify(currentDrafts));

                    // Mail (Aliases)
                    let aliasesRestored = 0;
                    if (data.mail.aliases) {
                        const currentAliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');
                        for (const [alias, owner] of Object.entries(data.mail.aliases)) {
                            if (!currentAliases[alias]) {
                                currentAliases[alias] = owner;
                                aliasesRestored++;
                            }
                        }
                        localStorage.setItem('rofl_aliases', JSON.stringify(currentAliases));
                    }

                    resolve({
                        success: true,
                        stats: {
                            secrets: secretsRestored,
                            emails: emailsRestored,
                            drafts: draftsRestored,
                            aliases: aliasesRestored
                        }
                    });

                } catch (error) {
                    console.error('Restore failed:', error);
                    let msg = 'Failed to decrypt or parse backup.';
                    if (error instanceof Error) msg = error.message;
                    reject(new Error(msg));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Trigger download of backup file
    downloadBackup(backup: any) {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `pribado-secure-backup-${dateStr}.blob`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export const backupService = new BackupService();
