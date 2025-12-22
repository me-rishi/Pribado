/**
 * Pribado API Client for CLI
 * Communicates with Pribado backend for proxy key status
 */

import { deriveEnclaveKey, getWalletFromSeed, calculateProxyId } from './wallet.js';

const DEFAULT_ENDPOINT = 'https://pribado.dev';

interface ProxyKeyInfo {
    active: boolean;
    interval: number;
    expiresIn?: number;
    lastRotated?: number;
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export class PribadoApi {
    private endpoint: string;
    private enclaveKey: string | null = null;
    private seedPhrase: string | null = null;

    constructor(endpoint: string = DEFAULT_ENDPOINT) {
        this.endpoint = endpoint;
    }

    /**
     * Initialize API client with seed phrase
     */
    async initialize(seedPhrase: string): Promise<void> {
        this.seedPhrase = seedPhrase;
        this.enclaveKey = await deriveEnclaveKey(seedPhrase);
    }

    /**
     * Check if API client is initialized
     */
    isInitialized(): boolean {
        return this.enclaveKey !== null;
    }

    /**
     * Get proxy key status for multiple keys
     */
    async getProxyStatus(pribadoKeys: string[]): Promise<Map<string, ProxyKeyInfo>> {
        if (!this.enclaveKey) {
            throw new Error('API not initialized. Call initialize() first.');
        }

        try {
            const response = await fetch(`${this.endpoint}/api/proxy/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Enclave-Key': this.enclaveKey,
                },
                body: JSON.stringify({ pribadoKeys }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json() as ApiResponse<Record<string, ProxyKeyInfo>>;

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to get proxy status');
            }

            return new Map(Object.entries(result.data));
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Network error');
        }
    }

    /**
     * Calculate Pribado proxy ID for a secret
     */
    async calculatePribadoId(secretId: string): Promise<string> {
        if (!this.seedPhrase) {
            throw new Error('API not initialized');
        }
        const wallet = getWalletFromSeed(this.seedPhrase);
        return calculateProxyId(secretId, wallet.privateKey);
    }

    /**
     * Provision a key to the proxy service
     */
    async provisionKey(
        pribadoKey: string,
        actualKey: string,
        provider: string,
        rotationInterval: number = 0,
        webhookUrl?: string
    ): Promise<boolean> {
        if (!this.enclaveKey) {
            throw new Error('API not initialized');
        }

        try {
            const response = await fetch(`${this.endpoint}/api/proxy/provision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Enclave-Key': this.enclaveKey,
                },
                body: JSON.stringify({
                    pribadoKey,
                    actualKey,
                    provider,
                    rotationInterval,
                    webhookUrl,
                }),
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json() as ApiResponse<void>;
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Revoke a provisioned key
     */
    async revokeKey(pribadoKey: string): Promise<boolean> {
        if (!this.enclaveKey) {
            throw new Error('API not initialized');
        }

        try {
            const response = await fetch(`${this.endpoint}/api/proxy/revoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Enclave-Key': this.enclaveKey,
                },
                body: JSON.stringify({ pribadoKey }),
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json() as ApiResponse<void>;
            return result.success;
        } catch {
            return false;
        }
    }
}
