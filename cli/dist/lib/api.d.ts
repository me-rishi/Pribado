/**
 * Pribado API Client for CLI
 * Communicates with Pribado backend for proxy key status
 */
interface ProxyKeyInfo {
    active: boolean;
    interval: number;
    expiresIn?: number;
    lastRotated?: number;
}
export declare class PribadoApi {
    private endpoint;
    private enclaveKey;
    private seedPhrase;
    constructor(endpoint?: string);
    /**
     * Initialize API client with seed phrase
     */
    initialize(seedPhrase: string): Promise<void>;
    /**
     * Check if API client is initialized
     */
    isInitialized(): boolean;
    /**
     * Get proxy key status for multiple keys
     */
    getProxyStatus(pribadoKeys: string[]): Promise<Map<string, ProxyKeyInfo>>;
    /**
     * Calculate Pribado proxy ID for a secret
     */
    calculatePribadoId(secretId: string): Promise<string>;
    /**
     * Provision a key to the proxy service
     */
    provisionKey(pribadoKey: string, actualKey: string, provider: string, rotationInterval?: number, webhookUrl?: string): Promise<boolean>;
    /**
     * Revoke a provisioned key
     */
    revokeKey(pribadoKey: string): Promise<boolean>;
}
export {};
//# sourceMappingURL=api.d.ts.map