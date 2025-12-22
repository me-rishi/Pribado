/**
 * Keys Command - List and manage API keys
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { configExists, loadConfig, getPublicConfig } from '../lib/config.js';
import { PribadoApi } from '../lib/api.js';
import { getWalletFromSeed, calculateProxyId, deriveEnclaveKey } from '../lib/wallet.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

interface StoredKey {
    id: string;
    name: string;
    provider: string;
    value: string;
    pribadoId: string;
    createdAt: number;
    provisioned: boolean;
}

function loadStoredKeys(): StoredKey[] {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch {
        // Ignore errors
    }
    return [];
}

function saveStoredKeys(keys: StoredKey[]): void {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export async function keysCommand(): Promise<void> {
    // Check if configured
    if (!configExists()) {
        console.log(chalk.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk.gray('   Run `pribado init` to get started.\n'));
        return;
    }

    const config = getPublicConfig();
    console.log(chalk.bold.cyan('\n🔑 Pribado API Keys\n'));
    console.log(`   ${chalk.gray('Wallet:')} ${chalk.green(config?.address)}\n`);

    // Get password
    const { password } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password to unlock and view your keys:',
            mask: '*',
        },
    ]);

    const spinner = ora('Unlocking wallet...').start();

    try {
        const decryptedConfig = loadConfig(password);
        const wallet = getWalletFromSeed(decryptedConfig.seedPhrase);
        spinner.succeed('Wallet unlocked');

        // Load stored keys
        const storedKeys = loadStoredKeys();

        if (storedKeys.length === 0) {
            console.log(chalk.gray('\n─────────────────────────────────────────────────\n'));
            console.log(chalk.yellow('  No API keys found.\n'));
            console.log(chalk.gray('  Run'), chalk.cyan('pribado keys add'), chalk.gray('to add your first key.\n'));
        } else {
            console.log(chalk.gray('\n─────────────────────────────────────────────────\n'));
            console.log(chalk.bold('  Your API Keys:\n'));

            for (const key of storedKeys) {
                const provider = PROVIDERS.find(p => p.value === key.provider)?.name || key.provider;
                const status = key.provisioned
                    ? chalk.green('● LIVE')
                    : chalk.yellow('○ NOT PROVISIONED');

                console.log(`  ${chalk.bold(key.name)} ${chalk.gray(`(${provider})`)}`);
                console.log(`     ${chalk.gray('Pribado Private API Proxy:')} ${chalk.cyan(key.pribadoId)}`);
                console.log(`     ${chalk.gray('Status:')} ${status}`);
                console.log(`     ${chalk.gray('API Key:')} ${chalk.gray(key.value.slice(0, 8) + '...' + key.value.slice(-4))}\n`);
            }
        }

        console.log(chalk.gray('─────────────────────────────────────────────────\n'));
        console.log(chalk.bold('Commands:'));
        console.log(`   ${chalk.cyan('pribado keys add')}       - Add a new API key`);
        console.log(`   ${chalk.cyan('pribado keys provision')} - Provision a key to go LIVE`);
        console.log(`   ${chalk.cyan('pribado keys revoke')}    - Revoke an API key`);
        console.log(`   ${chalk.cyan('pribado keys revoke all')} - Revoke all API keys\n`);

    } catch (error) {
        spinner.fail('Failed to load keys');
        if (error instanceof Error && error.message === 'Invalid password') {
            console.log(chalk.red('\n❌ Invalid password.\n'));
        } else {
            console.log(chalk.red(`\n${error}\n`));
        }
    }
}

export async function keysAddCommand(): Promise<void> {
    // Check if configured
    if (!configExists()) {
        console.log(chalk.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk.gray('   Run `pribado init` to get started.\n'));
        return;
    }

    console.log(chalk.bold.cyan('\n➕ Add New API Key\n'));

    // Get password first
    const { password } = await inquirer.prompt([
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
        decryptedConfig = loadConfig(password);
        wallet = getWalletFromSeed(decryptedConfig.seedPhrase);
    } catch {
        console.log(chalk.red('\n❌ Invalid password.\n'));
        return;
    }

    // Collect key info
    const answers = await inquirer.prompt([
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
            validate: (input: string) => input.length > 0 || 'Name is required',
        },
        {
            type: 'password',
            name: 'apiKey',
            message: 'Paste your API key:',
            mask: '*',
            validate: (input: string) => input.length > 10 || 'API key seems too short',
        },
    ]);

    const spinner = ora('Generating Pribado Private API proxy...').start();

    try {
        // Generate unique ID for this key
        const keyId = `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const pribadoId = await calculateProxyId(keyId, wallet.privateKey);

        spinner.text = 'Provisioning key to Pribado...';

        // Provision to the server
        const enclaveKey = await deriveEnclaveKey(decryptedConfig.seedPhrase);

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

        const result = await response.json() as { success: boolean; error?: string };

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

        console.log(chalk.bold.green('\n✅ API Key Created!\n'));
        console.log(`   ${chalk.gray('Name:')}       ${chalk.white(answers.name)}`);
        console.log(`   ${chalk.gray('Provider:')}   ${chalk.white(PROVIDERS.find(p => p.value === answers.provider)?.name)}`);
        console.log(`   ${chalk.gray('Pribado Private API proxy:')} ${chalk.cyan(pribadoId)}`);
        console.log(`   ${chalk.gray('Status:')}     ${chalk.green('● LIVE')}\n`);

        // Provider-specific examples
        const curlExamples: Record<string, string> = {
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

        console.log(chalk.bold('Test with curl:'));
        console.log(chalk.gray(`\n${exampleWithKey}\n`));

        console.log(chalk.bold('Revoke this key:'));
        console.log(chalk.gray(`\n   pribado keys revoke ${pribadoId}\n`));

    } catch (error) {
        spinner.fail('Failed to add key');
        console.log(chalk.red(`\n${error}\n`));
    }
}

export async function keysRevokeCommand(preselectedKeyId?: string, revokeAll: boolean = false): Promise<void> {
    // Check if configured
    if (!configExists()) {
        console.log(chalk.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk.gray('   Run `pribado init` to get started.\n'));
        return;
    }

    // Load stored keys
    let storedKeys = loadStoredKeys();

    if (storedKeys.length === 0) {
        console.log(chalk.yellow('\n⚠️  No API keys found.'));
        console.log(chalk.gray('   Run `pribado keys add` to add your first key.\n'));
        return;
    }

    // Handle "all" alias
    if (preselectedKeyId === 'all') {
        revokeAll = true;
        preselectedKeyId = undefined;
    }

    if (revokeAll) {
        console.log(chalk.bold.red('\n🗑️  Revoke ALL API Keys\n'));
    } else {
        console.log(chalk.bold.red('\n🗑️  Revoke API Key\n'));
    }

    // Get password first
    const { password } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password:',
            mask: '*',
        },
    ]);

    let decryptedConfig;

    try {
        decryptedConfig = loadConfig(password);
    } catch {
        console.log(chalk.red('\n❌ Invalid password.\n'));
        return;
    }

    let keysToRevoke: typeof storedKeys = [];

    if (revokeAll) {
        keysToRevoke = [...storedKeys];

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Are you sure you want to revoke ALL ${storedKeys.length} keys? This cannot be undone.`,
                default: false,
            },
        ]);

        if (!confirmed) {
            console.log(chalk.gray('\nCancelled.\n'));
            return;
        }

    } else {
        // Select key to revoke
        let keyIdToRevoke = preselectedKeyId;

        if (!keyIdToRevoke) {
            const keyChoices = storedKeys.map(key => ({
                name: `${key.name} (${key.provider}) - ${key.pribadoId.slice(0, 20)}...`,
                value: key.id,
            }));

            const { selectedKeyId } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedKeyId',
                    message: 'Select key to revoke:',
                    choices: keyChoices,
                },
            ]);
            keyIdToRevoke = selectedKeyId;
        } else {
            // Check if the argument matches a Pribado ID or a local ID
            const matchedKey = storedKeys.find(k => k.pribadoId === preselectedKeyId || k.id === preselectedKeyId);
            if (matchedKey) {
                keyIdToRevoke = matchedKey.id;
            } else {
                console.log(chalk.red(`\n❌ Key "${preselectedKeyId}" not found.\n`));
                return;
            }
        }

        const keyToRevoke = storedKeys.find(k => k.id === keyIdToRevoke);
        if (!keyToRevoke) {
            console.log(chalk.red('\n❌ Key not found.\n'));
            return;
        }

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Are you sure you want to revoke "${keyToRevoke.name}" (${keyToRevoke.pribadoId.slice(0, 15)}...)? This cannot be undone.`,
                default: false,
            },
        ]);

        if (!confirmed) {
            console.log(chalk.gray('\nCancelled.\n'));
            return;
        }

        keysToRevoke.push(keyToRevoke);
    }

    const spinner = ora(revokeAll ? 'Revoking all keys...' : 'Revoking key...').start();

    try {
        const enclaveKey = await deriveEnclaveKey(decryptedConfig.seedPhrase);
        let successCount = 0;
        let failCount = 0;

        for (const key of keysToRevoke) {
            try {
                if (revokeAll) spinner.text = `Revoking ${key.name}...`;

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

                const result = await response.json() as { success: boolean; error?: string };

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

            } catch (error) {
                failCount++;
            }
        }

        if (failCount > 0) {
            spinner.warn(`Revoked ${successCount} keys. Failed to revoke ${failCount} keys.`);
        } else {
            spinner.succeed(revokeAll ? 'All keys revoked!' : 'Key revoked!');

            if (revokeAll) {
                console.log(chalk.bold.green(`\n✅ ${successCount} keys have been revoked.\n`));
            } else {
                const key = keysToRevoke[0];
                console.log(chalk.bold.green(`\n✅ "${key.name}" has been revoked.\n`));
                console.log(chalk.gray(`   Pribado Private API Proxy ${key.pribadoId.slice(0, 20)}... is no longer active.\n`));
            }
        }

    } catch (error) {
        spinner.fail('Failed to process revocation');
        console.log(chalk.red(`\n${error}\n`));
    }
}
