"use strict";
/**
 * Config file manager for Pribado CLI
 * Stores encrypted seed phrase at ~/.pribado/config.json
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configExists = configExists;
exports.getConfigPath = getConfigPath;
exports.saveConfig = saveConfig;
exports.loadConfig = loadConfig;
exports.getPublicConfig = getPublicConfig;
exports.deleteConfig = deleteConfig;
exports.updateNetwork = updateNetwork;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto_js_1 = require("./crypto.js");
const CONFIG_DIR = path.join(os.homedir(), '.pribado');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
/**
 * Ensure config directory exists with proper permissions
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { mode: 0o700 });
    }
}
/**
 * Check if config file exists
 */
function configExists() {
    return fs.existsSync(CONFIG_FILE);
}
/**
 * Get the config file path
 */
function getConfigPath() {
    return CONFIG_FILE;
}
/**
 * Save config with encrypted seed phrase
 */
function saveConfig(address, seedPhrase, password, network = 'testnet', apiEndpoint = 'https://pribado.dev') {
    ensureConfigDir();
    const seedData = { seed: seedPhrase };
    const encryptedSeed = (0, crypto_js_1.encryptObject)(seedData, password);
    const config = {
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
function loadConfig(password) {
    if (!configExists()) {
        throw new Error('No config found. Run `pribado init` first.');
    }
    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configJson);
    try {
        const seedData = (0, crypto_js_1.decryptObject)(config.encryptedSeed, password);
        return {
            address: config.address,
            seedPhrase: seedData.seed,
            network: config.network,
            apiEndpoint: config.apiEndpoint,
            createdAt: config.createdAt,
        };
    }
    catch {
        throw new Error('Invalid password');
    }
}
/**
 * Get config without decrypting (for display purposes)
 */
function getPublicConfig() {
    if (!configExists()) {
        return null;
    }
    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configJson);
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
function deleteConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
    }
}
/**
 * Update network setting
 */
function updateNetwork(network) {
    if (!configExists()) {
        throw new Error('No config found');
    }
    const configJson = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configJson);
    config.network = network;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
//# sourceMappingURL=config.js.map