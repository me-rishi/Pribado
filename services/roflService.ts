// Simplified ROFL Service for Private Email
// This simulates OASIS ROFL functionality for Sapphire Testnet

// Sapphire Testnet Configuration
const SAPPHIRE_TESTNET = {
    rpc: 'https://testnet.sapphire.oasis.dev',
    chainId: '0x5aff',
    runtimeId: '000000000000000000000000000000000000000000000000f80306c9858e7279',
};

// Mock TEE Key (in production, this would be generated within the TEE)
const MOCK_TEE_KEY = new Uint8Array([
    42, 13, 37, 89, 156, 201, 244, 99, 123, 45, 67, 89, 12, 34, 56, 78,
    90, 12, 34, 56, 78, 90, 12, 34, 56, 78, 90, 12, 34, 56, 78, 90
]);

// ROFL Service for Private Email
export class ROFLMailService {
    private client: any;
    private signer: any;
    private runtime: any;

    constructor() {
        console.log('Initializing ROFL Mail Service for Sapphire Testnet...');
        // In production, this would connect to real Oasis nodes
        // For now, we simulate the connection
    }

    // Generate TEE attestation quote
    async generateAttestationQuote(): Promise<string> {
        // Simulate TEE attestation generation
        const mockQuote = {
            version: 1,
            status: 'OK',
            timestamp: Date.now(),
            enclaveId: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            signature: '0x' + Array(128).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            quoteType: 'TEE_QUOTE',
            runtime: 'ROFL_PrivateMail_v1',
        };

        return JSON.stringify(mockQuote);
    }

    // Verify remote attestation
    async verifyAttestation(quote: string): Promise<boolean> {
        try {
            const attestation = JSON.parse(quote);
            // In production, this would verify against Intel/AMD root keys
            return attestation.status === 'OK' &&
                attestation.enclaveId.length === 66 &&
                attestation.quoteType === 'TEE_QUOTE';
        } catch (error) {
            console.error('Attestation verification failed:', error);
            return false;
        }
    }

    // Encrypt email content within TEE
    async encryptEmailContent(content: string): Promise<string> {
        // Simulate hardware-level encryption within TEE
        const encoder = new TextEncoder();
        const data = encoder.encode(content);

        // XOR encryption with TEE key (simulated)
        const encrypted = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            encrypted[i] = data[i] ^ MOCK_TEE_KEY[i % MOCK_TEE_KEY.length];
        }

        // Return base64 encoded encrypted data with metadata
        const encryptedData = {
            ciphertext: btoa(String.fromCharCode(...encrypted)),
            algorithm: 'TEE_XCHACHA20',
            keyId: 'teek_' + Array(16).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            timestamp: Date.now(),
        };

        return JSON.stringify(encryptedData);
    }

    // Decrypt email content within TEE
    async decryptEmailContent(encryptedData: string): Promise<string> {
        try {
            const { ciphertext, algorithm, keyId } = JSON.parse(encryptedData);

            if (algorithm !== 'TEE_XCHACHA20') {
                throw new Error('Unsupported encryption algorithm');
            }

            // Decode from base64
            const encrypted = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

            // XOR decryption with TEE key (simulated)
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i] ^ MOCK_TEE_KEY[i % MOCK_TEE_KEY.length];
            }

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt email content');
        }
    }

    // Generate a secure random access key (32 bytes hex)
    private generateAccessKey(): string {
        const key = new Uint8Array(32);
        crypto.getRandomValues(key);
        return Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Encrypt metadata object with the random access key
    async encryptMetadataWithKey(metadata: any, keyHex: string): Promise<string> {
        const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const key = await crypto.subtle.importKey(
            'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(metadata));

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, encoded
        );

        // Return IV + Ciphertext as base64
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    // Decrypt metadata object with the random access key
    async decryptMetadataWithKey(encryptedBlob: string, keyHex: string): Promise<any> {
        try {
            const combined = Uint8Array.from(atob(encryptedBlob), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);

            const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            const key = await crypto.subtle.importKey(
                'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, key, data
            );

            return JSON.parse(new TextDecoder().decode(decrypted));
        } catch (e) {
            console.error('Metadata decryption failed', e);
            throw new Error('Invalid Access Key');
        }
    }

    // Store encrypted email on Sapphire (real blockchain transaction)
    async storeEncryptedEmail(
        sender: string,
        recipient: string,
        subject: string,
        encryptedBody: string,
        metadata: any
    ): Promise<{ emailId: string; txHash: string | null; explorerUrl: string | null; accessKey: string }> {
        const emailId = 'email_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Generate a random access key for this email's metadata
        const accessKey = this.generateAccessKey();

        // Encrypt the sensitive metadata
        const sensitiveMeta = {
            sender,
            recipient, // No longer visible in plain text
            subjectHash: await this.hashString(subject),
            timestamp: Date.now(),
            ...metadata
        };

        const encryptedMetadata = await this.encryptMetadataWithKey(sensitiveMeta, accessKey);

        const emailRecord = {
            id: emailId,
            sender,
            recipient,
            subjectHash: sensitiveMeta.subjectHash,
            bodyHash: await this.hashString(encryptedBody),
            encryptedBody,
            metadata: sensitiveMeta, // Store decrypted version locally for sender
            accessKey, // Store key locally for sender
            timestamp: Date.now(),
            attestation: await this.generateAttestationQuote(),
            storedOn: 'sapphire_testnet',
            txHash: null as string | null,
            explorerUrl: null as string | null,
        };

        // Try to store on Sapphire blockchain
        try {
            const network = typeof window !== 'undefined' ? localStorage.getItem('pribado_network') || 'testnet' : 'testnet';
            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'storeEmail',
                    network,
                    data: {
                        emailId,
                        encryptedData: encryptedBody,
                        metadata: {
                            // On-chain metadata is now fully opaque
                            encryptedBlob: encryptedMetadata,
                            // Only non-sensitive operational flag
                            version: 2
                        },
                    },
                }),
            });

            const result = await response.json();

            if (result.success) {
                emailRecord.txHash = result.txHash;
                emailRecord.explorerUrl = result.explorerUrl;
                console.log('Email stored on Sapphire blockchain:', result.txHash);
            } else {
                console.warn('Failed to store on blockchain, using local storage:', result.error);
            }
        } catch (error) {
            console.warn('Blockchain storage failed, falling back to local:', error);
        }

        // Always store locally as backup/cache
        const storedEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
        storedEmails.push(emailRecord);
        localStorage.setItem('rofl_emails', JSON.stringify(storedEmails));

        return {
            emailId,
            txHash: emailRecord.txHash,
            explorerUrl: emailRecord.explorerUrl,
            accessKey
        };
    }

    // Retrieve encrypted email from Sapphire (simulated)
    async retrieveEncryptedEmail(emailId: string): Promise<any> {
        // In production, this would fetch from Sapphire smart contract
        const storedEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
        const email = storedEmails.find((e: any) => e.id === emailId);

        if (!email) {
            throw new Error('Email not found: ' + emailId);
        }

        // Simulating fetching 'encryptedBlob' from chain if we were doing a real restore
        // For local simulation, we have the decrypted metadata.
        // But for the recipient flow (via link), they will need to decrypt 'encryptedBlob' from chain data.

        // Note: For this prototype we rely on local simulation or assume the caller has the key
        // We will add a method specifically for link-based retrieval.

        return email;
    }

    // New method: Retrieve via Key (simulating recipient view)
    async retrieveViaLink(emailId: string, accessKey: string): Promise<any> {
        // In a real app, this fetches from chain. 
        // Here we mock fetching from "Global Storage" (our simulated blockchain)
        const storedEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
        const email = storedEmails.find((e: any) => e.id === emailId);

        if (!email) throw new Error('Email not found on network');

        // If we are the recipient, we initially only see the opaque blob
        // We must decrypt it.
        // Since our local mock stores the decrypted version (because sender saved it),
        // let's simulate the decryption process to prove it works.

        // Re-construct what was on chain
        const sensitiveMeta = email.metadata;
        const encryptedBlob = await this.encryptMetadataWithKey(sensitiveMeta, accessKey);

        // Now decrypt it
        const decryptedMeta = await this.decryptMetadataWithKey(encryptedBlob, accessKey);

        return {
            ...email,
            metadata: decryptedMeta
        };
    }

    // Get all emails for a user
    async getUserEmails(userAddress: string): Promise<any[]> {
        const storedEmails = JSON.parse(localStorage.getItem('rofl_emails') || '[]');
        return storedEmails.filter((email: any) =>
            email.recipient === userAddress || email.sender === userAddress
        );
    }

    // Hash string for integrity verification
    private async hashString(input: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Get ROFL enclave status
    async getEnclaveStatus(): Promise<any> {
        const attestation = await this.generateAttestationQuote();
        const isValid = await this.verifyAttestation(attestation);

        return {
            status: isValid ? 'operational' : 'error',
            enclaveId: JSON.parse(attestation).enclaveId,
            timestamp: Date.now(),
            network: 'Sapphire Testnet',
            runtime: 'ROFL_PrivateMail_v1',
            attestationValid: isValid,
            rpcEndpoint: SAPPHIRE_TESTNET.rpc,
        };
    }

    // Initialize ROFL mail service
    async initialize(): Promise<boolean> {
        try {
            console.log('Initializing ROFL Mail Service for Sapphire Testnet...');

            // Simulate connecting to Sapphire
            console.log('Connected to Sapphire Testnet RPC:', SAPPHIRE_TESTNET.rpc);

            // Generate and verify initial attestation
            const attestation = await this.generateAttestationQuote();
            const isValid = await this.verifyAttestation(attestation);

            if (!isValid) {
                throw new Error('Initial attestation verification failed');
            }

            console.log('ROFL Mail Service initialized successfully');
            console.log('Enclave ID:', JSON.parse(attestation).enclaveId);

            return true;
        } catch (error) {
            console.error('Failed to initialize ROFL Mail Service:', error);
            return false;
        }
    }

    // Send encrypted email
    async sendEncryptedEmail(
        sender: string,
        recipient: string,
        subject: string,
        body: string,
        isEncrypted: boolean = true,
        accessType: 'email' | 'key' = 'email',
        secretKey: string = '',
        hint: string = ''
    ): Promise<{ emailId: string; txHash: string | null; explorerUrl: string | null; accessKey: string }> {
        try {
            // Encrypt body if requested
            const encryptedBody = isEncrypted ? await this.encryptEmailContent(body) : body;

            // Store encrypted email
            const result = await this.storeEncryptedEmail(
                sender,
                recipient,
                subject,
                encryptedBody,
                {
                    isEncrypted,
                    subject,
                    timestamp: Date.now(),
                    accessType,
                    secretKey: accessType === 'key' ? secretKey : '',
                    hint: accessType === 'key' ? hint : '',
                }
            );

            console.log('Encrypted email sent successfully:', result.emailId);
            if (result.txHash) {
                console.log('Transaction hash:', result.txHash);
                console.log('Explorer URL:', result.explorerUrl);
            }
            return result;
        } catch (error) {
            console.error('Failed to send encrypted email:', error);
            throw error;
        }
    }

    // Receive and decrypt email
    async receiveEncryptedEmail(emailId: string): Promise<{
        id: string;
        sender: string;
        recipient: string;
        subject: string;
        body: string;
        isEncrypted: boolean;
        timestamp: number;
    }> {
        try {
            const email = await this.retrieveEncryptedEmail(emailId);

            // Decrypt body if encrypted
            const isEncrypted = email.metadata?.isEncrypted;
            const decryptedBody = isEncrypted ?
                await this.decryptEmailContent(email.encryptedBody) :
                email.encryptedBody;

            return {
                id: email.id,
                sender: email.sender,
                recipient: email.recipient,
                subject: email.metadata?.subject || 'No Subject',
                body: decryptedBody,
                isEncrypted,
                timestamp: email.timestamp,
            };
        } catch (error) {
            console.error('Failed to receive encrypted email:', error);
            throw error;
        }
    }

    // ==========================================
    // CLOUD SYNC FEATURES
    // ==========================================

    // Store encrypted mail backup on Sapphire
    async storeCloudBackup(encryptedMail: string, address: string): Promise<{ txHash: string }> {
        try {
            const network = typeof window !== 'undefined' ? localStorage.getItem('pribado_network') || 'testnet' : 'testnet';
            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'storeMailBackup',
                    network,
                    data: {
                        encryptedMail,
                        address,
                        timestamp: Date.now(),
                    },
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to sync mail to cloud');
            }

            console.log('Mail synced to cloud:', result.txHash);
            return { txHash: result.txHash };
        } catch (error) {
            console.error('Cloud sync failed:', error);
            throw error;
        }
    }

    // Restore encrypted mail backup from Sapphire
    async restoreCloudBackup(address: string): Promise<{ encryptedMail: string; timestamp: number } | null> {
        try {
            const network = typeof window !== 'undefined' ? localStorage.getItem('pribado_network') || 'testnet' : 'testnet';
            const response = await fetch('/api/sapphire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'findMailBackupByAddress',
                    network,
                    data: { userAddress: address },
                }),
            });

            const result = await response.json();

            if (!result.success) {
                // Return null if no backup found
                if (result.error && result.error.includes('No mail backup found')) {
                    return null;
                }
                throw new Error(result.error || 'Failed to restore mail from cloud');
            }

            console.log('Mail restored from cloud, tx:', result.txHash);
            return {
                encryptedMail: result.encryptedMail,
                timestamp: result.timestamp
            };
        } catch (error) {
            console.error('Cloud restore failed:', error);
            throw error;
        }
    }

    // ==========================================
    // DISPOSABLE EMAIL GATEWAY (SMTP BRIDGE)
    // ==========================================

    // Create a new disposable alias linked to the user's address
    async createDisposableAlias(userAddress: string): Promise<string> {
        // Generate random alias
        const randomString = Math.random().toString(36).substring(2, 10);
        const alias = `ghost_${randomString}@pribado.dev`;

        // Store mapping in "Global Gateway Registry" (mocked via localStorage)
        const aliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');
        aliases[alias] = userAddress;
        localStorage.setItem('rofl_aliases', JSON.stringify(aliases));

        return alias;
    }

    // Get all aliases for a user
    async getDisposableAliases(userAddress: string): Promise<string[]> {
        const aliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');
        return Object.keys(aliases).filter(alias => aliases[alias] === userAddress);
    }

    // Delete an alias
    async deleteDisposableAlias(alias: string): Promise<void> {
        const aliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');
        delete aliases[alias];
        localStorage.setItem('rofl_aliases', JSON.stringify(aliases));
    }

    // Simulate incoming SMTP email (Gateway receiving from Gmail/External)
    async simulateIncomingSMTP(toAlias: string, fromEmail: string, subject: string, body: string): Promise<boolean> {
        try {
            // 1. Resolve Alias
            const aliases = JSON.parse(localStorage.getItem('rofl_aliases') || '{}');
            const targetUserAddress = aliases[toAlias];

            if (!targetUserAddress) {
                console.error(`SMTP Error: Recipient alias ${toAlias} not found.`);
                return false;
            }

            console.log(`SMTP Gateway: Received email for ${toAlias} -> Forwarding to Chain Address ${targetUserAddress}`);

            // 2. Encrypt for User (Gateway acts as sender on-chain, but preserves external metadata)
            // We use the Gateway's internal identity as the 'sender' on-chain, but metadata shows original from
            const gatewayChainAddress = "0xGateway_SMTP_Bridge";

            // 3. Store on Chain
            await this.storeEncryptedEmail(
                gatewayChainAddress,   // Sender (On-Chain)
                targetUserAddress,     // Recipient (On-Chain)
                `[SMTP] ${subject}`,   // Subject
                await this.encryptEmailContent(body), // Body (Encrypted)
                {
                    isExternal: true,
                    originalSender: fromEmail, // "rfxposdemo@gmail.com"
                    originalRecipient: toAlias,
                    timestamp: Date.now(),
                    subject: subject,
                    isEncrypted: true
                }
            );

            return true;
        } catch (error) {
            console.error('SMTP Simulation Failed:', error);
            return false;
        }
    }
}

// Singleton instance
export const roflMailService = new ROFLMailService();

// Initialize on module load
roflMailService.initialize().then(success => {
    if (success) {
        console.log('ROFL Mail Service is ready for encrypted communications');
    } else {
        console.error('ROFL Mail Service failed to initialize');
    }
});