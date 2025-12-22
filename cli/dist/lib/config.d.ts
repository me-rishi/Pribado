/**
 * Config file manager for Pribado CLI
 * Stores encrypted seed phrase at ~/.pribado/config.json
 */
interface Config {
    address: string;
    encryptedSeed: string;
    network: 'testnet' | 'mainnet';
    apiEndpoint: string;
    createdAt: number;
}
interface DecryptedConfig {
    address: string;
    seedPhrase: string;
    network: 'testnet' | 'mainnet';
    apiEndpoint: string;
    createdAt: number;
}
/**
 * Check if config file exists
 */
export declare function configExists(): boolean;
/**
 * Get the config file path
 */
export declare function getConfigPath(): string;
/**
 * Save config with encrypted seed phrase
 */
export declare function saveConfig(address: string, seedPhrase: string, password: string, network?: 'testnet' | 'mainnet', apiEndpoint?: string): void;
/**
 * Load and decrypt config
 */
export declare function loadConfig(password: string): DecryptedConfig;
/**
 * Get config without decrypting (for display purposes)
 */
export declare function getPublicConfig(): Omit<Config, 'encryptedSeed'> | null;
/**
 * Delete config file
 */
export declare function deleteConfig(): void;
/**
 * Update network setting
 */
export declare function updateNetwork(network: 'testnet' | 'mainnet'): void;
export {};
//# sourceMappingURL=config.d.ts.map