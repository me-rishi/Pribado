"use strict";
/**
 * Keys Command - List and manage API keys
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.keysCommand = keysCommand;
exports.keysAddCommand = keysAddCommand;
exports.keysRevokeCommand = keysRevokeCommand;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const config_js_1 = require("../lib/config.js");
const wallet_js_1 = require("../lib/wallet.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Provider display names
const PROVIDERS = [
    { value: 'openai', name: 'OpenAI' },
    { value: 'anthropic', name: 'Anthropic' },
    { value: 'google', name: 'Google AI' },
    { value: 'deepseek', name: 'DeepSeek' },
    { value: 'groq', name: 'Groq' },
    { value: 'openrouter', name: 'OpenRouter' },
    { value: 'supabase', name: 'Supabase' },
];
// Local key storage path
const KEYS_FILE = path.join(os.homedir(), '.pribado', 'keys.json');
function loadStoredKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    }
    catch {
        // Ignore errors
    }
    return [];
}
function saveStoredKeys(keys) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}
async function keysCommand() {
    // Check if configured
    if (!(0, config_js_1.configExists)()) {
        console.log(chalk_1.default.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk_1.default.gray('   Run `pribado init` to get started.\n'));
        return;
    }
    const config = (0, config_js_1.getPublicConfig)();
    console.log(chalk_1.default.bold.cyan('\n🔑 Pribado API Keys\n'));
    console.log(`   ${chalk_1.default.gray('Wallet:')} ${chalk_1.default.green(config?.address)}\n`);
    // Get password
    const { password } = await inquirer_1.default.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password to unlock and view your keys:',
            mask: '*',
        },
    ]);
    const spinner = (0, ora_1.default)('Unlocking wallet...').start();
    try {
        const decryptedConfig = (0, config_js_1.loadConfig)(password);
        const wallet = (0, wallet_js_1.getWalletFromSeed)(decryptedConfig.seedPhrase);
        spinner.succeed('Wallet unlocked');
        // Load stored keys
        const storedKeys = loadStoredKeys();
        if (storedKeys.length === 0) {
            console.log(chalk_1.default.gray('\n─────────────────────────────────────────────────\n'));
            console.log(chalk_1.default.yellow('  No API keys found.\n'));
            console.log(chalk_1.default.gray('  Run'), chalk_1.default.cyan('pribado keys add'), chalk_1.default.gray('to add your first key.\n'));
        }
        else {
            console.log(chalk_1.default.gray('\n─────────────────────────────────────────────────\n'));
            console.log(chalk_1.default.bold('  Your API Keys:\n'));
            for (const key of storedKeys) {
                const provider = PROVIDERS.find(p => p.value === key.provider)?.name || key.provider;
                const status = key.provisioned
                    ? chalk_1.default.green('● LIVE')
                    : chalk_1.default.yellow('○ NOT PROVISIONED');
                console.log(`  ${chalk_1.default.bold(key.name)} ${chalk_1.default.gray(`(${provider})`)}`);
                console.log(`     ${chalk_1.default.gray('Pribado Private API Proxy:')} ${chalk_1.default.cyan(key.pribadoId)}`);
                console.log(`     ${chalk_1.default.gray('Status:')} ${status}`);
                console.log(`     ${chalk_1.default.gray('API Key:')} ${chalk_1.default.gray(key.value.slice(0, 8) + '...' + key.value.slice(-4))}\n`);
            }
        }
        console.log(chalk_1.default.gray('─────────────────────────────────────────────────\n'));
        console.log(chalk_1.default.bold('Commands:'));
        console.log(`   ${chalk_1.default.cyan('pribado keys add')}       - Add a new API key`);
        console.log(`   ${chalk_1.default.cyan('pribado keys provision')} - Provision a key to go LIVE`);
        console.log(`   ${chalk_1.default.cyan('pribado keys revoke')}    - Revoke an API key`);
        console.log(`   ${chalk_1.default.cyan('pribado keys revoke all')} - Revoke all API keys\n`);
    }
    catch (error) {
        spinner.fail('Failed to load keys');
        if (error instanceof Error && error.message === 'Invalid password') {
            console.log(chalk_1.default.red('\n❌ Invalid password.\n'));
        }
        else {
            console.log(chalk_1.default.red(`\n${error}\n`));
        }
    }
}
async function keysAddCommand() {
    // Check if configured
    if (!(0, config_js_1.configExists)()) {
        console.log(chalk_1.default.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk_1.default.gray('   Run `pribado init` to get started.\n'));
        return;
    }
    console.log(chalk_1.default.bold.cyan('\n➕ Add New API Key\n'));
    // Get password first
    const { password } = await inquirer_1.default.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password to continue adding a key:',
            mask: '*',
        },
    ]);
    let decryptedConfig;
    let wallet;
    try {
        decryptedConfig = (0, config_js_1.loadConfig)(password);
        wallet = (0, wallet_js_1.getWalletFromSeed)(decryptedConfig.seedPhrase);
    }
    catch {
        console.log(chalk_1.default.red('\n❌ Invalid password.\n'));
        return;
    }
    // Collect key info
    const answers = await inquirer_1.default.prompt([
        {
            type: 'list',
            name: 'provider',
            message: 'Select provider:',
            choices: PROVIDERS,
        },
        {
            type: 'input',
            name: 'name',
            message: 'Key name (e.g., "Production OpenAI"):',
            validate: (input) => input.length > 0 || 'Name is required',
        },
        {
            type: 'password',
            name: 'apiKey',
            message: 'Paste your API key:',
            mask: '*',
            validate: (input) => input.length > 10 || 'API key seems too short',
        },
    ]);
    const spinner = (0, ora_1.default)('Generating Pribado Private API proxy...').start();
    try {
        // Generate unique ID for this key
        const keyId = `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const pribadoId = await (0, wallet_js_1.calculateProxyId)(keyId, wallet.privateKey);
        spinner.text = 'Provisioning key to Pribado...';
        // Provision to the server
        const enclaveKey = await (0, wallet_js_1.deriveEnclaveKey)(decryptedConfig.seedPhrase);
        const response = await fetch(`${decryptedConfig.apiEndpoint}/api/proxy/provision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-enclave-key': enclaveKey,
                'x-enclave-owner': decryptedConfig.address,
            },
            body: JSON.stringify({
                pribadoKey: pribadoId,
                realKey: answers.apiKey,
                provider: answers.provider,
                rotationInterval: 0,
            }),
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to provision key');
        }
        // Save locally
        const storedKeys = loadStoredKeys();
        storedKeys.push({
            id: keyId,
            name: answers.name,
            provider: answers.provider,
            value: answers.apiKey,
            pribadoId,
            createdAt: Date.now(),
            provisioned: true,
        });
        saveStoredKeys(storedKeys);
        spinner.succeed('Key added and provisioned!');
        console.log(chalk_1.default.bold.green('\n✅ API Key Created!\n'));
        console.log(`   ${chalk_1.default.gray('Name:')}       ${chalk_1.default.white(answers.name)}`);
        console.log(`   ${chalk_1.default.gray('Provider:')}   ${chalk_1.default.white(PROVIDERS.find(p => p.value === answers.provider)?.name)}`);
        console.log(`   ${chalk_1.default.gray('Pribado Private API proxy:')} ${chalk_1.default.cyan(pribadoId)}`);
        console.log(`   ${chalk_1.default.gray('Status:')}     ${chalk_1.default.green('● LIVE')}\n`);
        // Provider-specific examples
        const curlExamples = {
            anthropic: `curl -X POST "https://pribado.dev/api/proxy/anthropic/messages" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_PRIV_KEY_HERE" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{"model": "claude-3-haiku-20240307", "max_tokens": 50, "messages": [{"role": "user", "content": "Hello, world!"}]}'`,
            openai: `curl -X POST "https://pribado.dev/api/proxy/openai/v1/chat/completions" \\
  -H "Authorization: Bearer YOUR_PRIV_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Hello, world!"}]}'`,
            openrouter: `curl -X POST "https://pribado.dev/api/proxy/openrouter/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_PRIV_KEY_HERE" \\
  -d '{"model": "deepseek/deepseek-chat", "messages": [{"role": "user", "content": "Hello, world!"}]}'`,
            google: `curl -X POST "https://pribado.dev/api/proxy/google/models/gemini-2.0-flash:generateContent" \\
  -H "Authorization: Bearer YOUR_PRIV_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"contents": [{"parts": [{"text": "Hello, world!"}]}]}'`,
            deepseek: `curl -X POST "https://pribado.dev/api/proxy/deepseek/chat/completions" \\
  -H "Authorization: Bearer YOUR_PRIV_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek-chat", "messages": [{"role": "user", "content": "Hello, world!"}]}'`,
            groq: `curl -X POST "https://pribado.dev/api/proxy/groq/v1/chat/completions" \\
  -H "Authorization: Bearer YOUR_PRIV_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": "Hello, world!"}]}'`,
            supabase: `curl -X GET "https://pribado.dev/api/proxy/supabase/rest/v1/your_table?select=*" \\
  -H "Authorization: Bearer YOUR_PRIV_KEY_HERE" \\
  -H "x-supabase-url: https://YOUR_PROJECT.supabase.co"`,
        };
        const example = curlExamples[answers.provider] || curlExamples.openai;
        const exampleWithKey = example.replace(/YOUR_PRIV_KEY_HERE/g, pribadoId);
        console.log(chalk_1.default.bold('Test with curl:'));
        console.log(chalk_1.default.gray(`\n${exampleWithKey}\n`));
        console.log(chalk_1.default.bold('Revoke this key:'));
        console.log(chalk_1.default.gray(`\n   pribado keys revoke ${pribadoId}\n`));
    }
    catch (error) {
        spinner.fail('Failed to add key');
        console.log(chalk_1.default.red(`\n${error}\n`));
    }
}
async function keysRevokeCommand(preselectedKeyId, revokeAll = false) {
    // Check if configured
    if (!(0, config_js_1.configExists)()) {
        console.log(chalk_1.default.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk_1.default.gray('   Run `pribado init` to get started.\n'));
        return;
    }
    // Load stored keys
    let storedKeys = loadStoredKeys();
    if (storedKeys.length === 0) {
        console.log(chalk_1.default.yellow('\n⚠️  No API keys found.'));
        console.log(chalk_1.default.gray('   Run `pribado keys add` to add your first key.\n'));
        return;
    }
    // Handle "all" alias
    if (preselectedKeyId === 'all') {
        revokeAll = true;
        preselectedKeyId = undefined;
    }
    if (revokeAll) {
        console.log(chalk_1.default.bold.red('\n🗑️  Revoke ALL API Keys\n'));
    }
    else {
        console.log(chalk_1.default.bold.red('\n🗑️  Revoke API Key\n'));
    }
    // Get password first
    const { password } = await inquirer_1.default.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password:',
            mask: '*',
        },
    ]);
    let decryptedConfig;
    try {
        decryptedConfig = (0, config_js_1.loadConfig)(password);
    }
    catch {
        console.log(chalk_1.default.red('\n❌ Invalid password.\n'));
        return;
    }
    let keysToRevoke = [];
    if (revokeAll) {
        keysToRevoke = [...storedKeys];
        const { confirmed } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Are you sure you want to revoke ALL ${storedKeys.length} keys? This cannot be undone.`,
                default: false,
            },
        ]);
        if (!confirmed) {
            console.log(chalk_1.default.gray('\nCancelled.\n'));
            return;
        }
    }
    else {
        // Select key to revoke
        let keyIdToRevoke = preselectedKeyId;
        if (!keyIdToRevoke) {
            const keyChoices = storedKeys.map(key => ({
                name: `${key.name} (${key.provider}) - ${key.pribadoId.slice(0, 20)}...`,
                value: key.id,
            }));
            const { selectedKeyId } = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'selectedKeyId',
                    message: 'Select key to revoke:',
                    choices: keyChoices,
                },
            ]);
            keyIdToRevoke = selectedKeyId;
        }
        else {
            // Check if the argument matches a Pribado ID or a local ID
            const matchedKey = storedKeys.find(k => k.pribadoId === preselectedKeyId || k.id === preselectedKeyId);
            if (matchedKey) {
                keyIdToRevoke = matchedKey.id;
            }
            else {
                console.log(chalk_1.default.red(`\n❌ Key "${preselectedKeyId}" not found.\n`));
                return;
            }
        }
        const keyToRevoke = storedKeys.find(k => k.id === keyIdToRevoke);
        if (!keyToRevoke) {
            console.log(chalk_1.default.red('\n❌ Key not found.\n'));
            return;
        }
        const { confirmed } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Are you sure you want to revoke "${keyToRevoke.name}" (${keyToRevoke.pribadoId.slice(0, 15)}...)? This cannot be undone.`,
                default: false,
            },
        ]);
        if (!confirmed) {
            console.log(chalk_1.default.gray('\nCancelled.\n'));
            return;
        }
        keysToRevoke.push(keyToRevoke);
    }
    const spinner = (0, ora_1.default)(revokeAll ? 'Revoking all keys...' : 'Revoking key...').start();
    try {
        const enclaveKey = await (0, wallet_js_1.deriveEnclaveKey)(decryptedConfig.seedPhrase);
        let successCount = 0;
        let failCount = 0;
        for (const key of keysToRevoke) {
            try {
                if (revokeAll)
                    spinner.text = `Revoking ${key.name}...`;
                const response = await fetch(`${decryptedConfig.apiEndpoint}/api/proxy/revoke`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-enclave-key': enclaveKey,
                        'x-enclave-owner': decryptedConfig.address,
                    },
                    body: JSON.stringify({
                        pribadoKey: key.pribadoId,
                    }),
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Failed to revoke key');
                }
                // Remove from local storage incrementally
                // We reload to be safe or filter from current list
                // Since we are iterating a copy, modifying storedKeys reference is tricky if we don't reload.
                // But storedKeys is local variable.
                // We need to read fresh or just filter from memory status.
                // Simpler: Just filter the key we just revoked from the persistent list.
                // Since we might fail on some, we should only remove successful ones.
                const currentStored = loadStoredKeys();
                const updated = currentStored.filter(k => k.id !== key.id);
                saveStoredKeys(updated);
                successCount++;
            }
            catch (error) {
                failCount++;
            }
        }
        if (failCount > 0) {
            spinner.warn(`Revoked ${successCount} keys. Failed to revoke ${failCount} keys.`);
        }
        else {
            spinner.succeed(revokeAll ? 'All keys revoked!' : 'Key revoked!');
            if (revokeAll) {
                console.log(chalk_1.default.bold.green(`\n✅ ${successCount} keys have been revoked.\n`));
            }
            else {
                const key = keysToRevoke[0];
                console.log(chalk_1.default.bold.green(`\n✅ "${key.name}" has been revoked.\n`));
                console.log(chalk_1.default.gray(`   Pribado Private API Proxy ${key.pribadoId.slice(0, 20)}... is no longer active.\n`));
            }
        }
    }
    catch (error) {
        spinner.fail('Failed to process revocation');
        console.log(chalk_1.default.red(`\n${error}\n`));
    }
}
//# sourceMappingURL=keys.js.map