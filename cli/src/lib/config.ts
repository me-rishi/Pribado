/**
 * Config file manager for Pribado CLI
 * Stores encrypted seed phrase at ~/.pribado/config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { encryptObject, decryptObject } from './crypto.js';

const CONFIG_DIR = path.join(os.homedir(), '.pribado');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

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
 * Ensure config directory exists with proper permissions
 */
function ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { mode: 0o700 });
    }
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
    return fs.existsSync(CONFIG_FILE);
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
    return CONFIG_FILE;
}

/**
 * Save config with encrypted seed phrase
 */
export function saveConfig(
    address: string,
    seedPhrase: string,
    password: string,
    network: 'testnet' | 'mainnet' = 'testnet',
    apiEndpoint: string = 'https://pribado.dev'
): void {
    ensureConfigDir();

    const seedData = { seed: seedPhrase };
    const encryptedSeed = encryptObject(seedData, password);

    const config: Config = {
        address,
        encryptedSeed,
        network,
        apiEndpoint,
        createdAt: Date.now(),
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Load and decrypt config
 */
export function loadConfig(password: string): DecryptedConfig {
    if (!configExists()) {
        throw new Error('No config found. Run `pribado init` first.');
    }

    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config: Config = JSON.parse(configJson);

    try {
        const seedData = decryptObject<{ seed: string }>(config.encryptedSeed, password);
        return {
            address: config.address,
            seedPhrase: seedData.seed,
            network: config.network,
            apiEndpoint: config.apiEndpoint,
            createdAt: config.createdAt,
        };
    } catch {
        throw new Error('Invalid password');
    }
}

/**
 * Get config without decrypting (for display purposes)
 */
export function getPublicConfig(): Omit<Config, 'encryptedSeed'> | null {
    if (!configExists()) {
        return null;
    }

    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config: Config = JSON.parse(configJson);

    return {
        address: config.address,
        network: config.network,
        apiEndpoint: config.apiEndpoint,
        createdAt: config.createdAt,
    };
}

/**
 * Delete config file
 */
export function deleteConfig(): void {
    if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
    }
}

/**
 * Update network setting
 */
export function updateNetwork(network: 'testnet' | 'mainnet'): void {
    if (!configExists()) {
        throw new Error('No config found');
    }

    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config: Config = JSON.parse(configJson);
    config.network = network;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
