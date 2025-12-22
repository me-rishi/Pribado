"use strict";
/**
 * Pribado API Client for CLI
 * Communicates with Pribado backend for proxy key status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PribadoApi = void 0;
const wallet_js_1 = require("./wallet.js");
const DEFAULT_ENDPOINT = 'https://pribado.dev';
class PribadoApi {
    endpoint;
    enclaveKey = null;
    seedPhrase = null;
    constructor(endpoint = DEFAULT_ENDPOINT) {
        this.endpoint = endpoint;
    }
    /**
     * Initialize API client with seed phrase
     */
    async initialize(seedPhrase) {
        this.seedPhrase = seedPhrase;
        this.enclaveKey = await (0, wallet_js_1.deriveEnclaveKey)(seedPhrase);
    }
    /**
     * Check if API client is initialized
     */
    isInitialized() {
        return this.enclaveKey !== null;
    }
    /**
     * Get proxy key status for multiple keys
     */
    async getProxyStatus(pribadoKeys) {
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
            const result = await response.json();
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to get proxy status');
            }
            return new Map(Object.entries(result.data));
        }
        catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Network error');
        }
    }
    /**
     * Calculate Pribado proxy ID for a secret
     */
    async calculatePribadoId(secretId) {
        if (!this.seedPhrase) {
            throw new Error('API not initialized');
        }
        const wallet = (0, wallet_js_1.getWalletFromSeed)(this.seedPhrase);
        return (0, wallet_js_1.calculateProxyId)(secretId, wallet.privateKey);
    }
    /**
     * Provision a key to the proxy service
     */
    async provisionKey(pribadoKey, actualKey, provider, rotationInterval = 0, webhookUrl) {
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
            const result = await response.json();
            return result.success;
        }
        catch {
            return false;
        }
    }
    /**
     * Revoke a provisioned key
     */
    async revokeKey(pribadoKey) {
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
            const result = await response.json();
            return result.success;
        }
        catch {
            return false;
        }
    }
}
exports.PribadoApi = PribadoApi;
//# sourceMappingURL=api.js.map