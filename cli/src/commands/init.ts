/**
 * Init Command - Create or import wallet
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import {
    generateSeedPhrase,
    isValidSeedPhrase,
    getAddressFromSeed,
    shortenAddress,
} from '../lib/wallet.js';
import { saveConfig, configExists, getPublicConfig } from '../lib/config.js';

export async function initCommand(): Promise<void> {
    console.log(chalk.bold.cyan('\n🔐 Pribado CLI Setup\n'));

    // Check if already configured
    if (configExists()) {
        const config = getPublicConfig();
        console.log(chalk.yellow('⚠️  Existing configuration found:'));
        console.log(`   Address: ${chalk.green(config?.address)}\n`);

        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: 'Do you want to overwrite with a new wallet?',
                default: false,
            },
        ]);

        if (!overwrite) {
            console.log(chalk.gray('\nSetup cancelled. Use `pribado login` to unlock.\n'));
            return;
        }
    }

    // Ask: Create or Import
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'How would you like to set up your wallet?',
            choices: [
                { name: '✨ Create a new wallet', value: 'create' },
                { name: '📥 Import existing seed phrase', value: 'import' },
            ],
        },
    ]);

    let seedPhrase: string;

    if (action === 'create') {
        // Generate new seed phrase
        seedPhrase = generateSeedPhrase();

        console.log(chalk.bold.yellow('\n⚠️  IMPORTANT: Write down your seed phrase!\n'));
        console.log(chalk.bgBlack.white('  ' + seedPhrase + '  '));
        console.log(chalk.red('\n⛔ Never share this with anyone. Store it securely offline.\n'));

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: 'I have securely stored my seed phrase',
                default: false,
            },
        ]);

        if (!confirmed) {
            console.log(chalk.red('\n❌ Please store your seed phrase before continuing.\n'));
            return;
        }
    } else {
        // Import existing seed phrase
        const { seed } = await inquirer.prompt([
            {
                type: 'password',
                name: 'seed',
                message: 'Enter your 12 or 24 word seed phrase:',
                mask: '*',
                validate: (input: string) => {
                    if (isValidSeedPhrase(input)) {
                        return true;
                    }
                    return 'Invalid seed phrase. Please enter a valid BIP-39 mnemonic.';
                },
            },
        ]);

        seedPhrase = seed;
    }

    // Set encryption password
    const { password, confirmPassword } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Create a password to encrypt your wallet:',
            mask: '*',
            validate: (input: string) => {
                if (input.length < 8) {
                    return 'Password must be at least 8 characters';
                }
                return true;
            },
        },
        {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:',
            mask: '*',
        },
    ]);

    if (password !== confirmPassword) {
        console.log(chalk.red('\n❌ Passwords do not match.\n'));
        return;
    }

    // Default to testnet
    const network = 'testnet';

    // Save config
    const spinner = ora('Setting up wallet...').start();

    try {
        const address = getAddressFromSeed(seedPhrase);
        saveConfig(address, seedPhrase, password, network);

        spinner.succeed('Wallet configured successfully!');

        // Show banner
        console.log(chalk.cyan(`
╔═════════════════════════════════════════════════════════════════════╗
║                                                                     ║
║      ██████╗ ██████╗ ██╗██████╗  █████╗ ██████╗  ██████╗            ║
║      ██╔══██╗██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔═══██╗           ║
║      ██████╔╝██████╔╝██║██████╔╝███████║██║  ██║██║   ██║           ║
║      ██╔═══╝ ██╔══██╗██║██╔══██╗██╔══██║██║  ██║██║   ██║           ║
║      ██║     ██║  ██║██║██████╔╝██║  ██║██████╔╝╚██████╔╝           ║
║      ╚═╝     ╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝            ║
║                                                                     ║
║                   Private API Key Management                        ║
║             BIP-39 • Argon2id • AES-256-GCM • TEE                   ║
║  No central authority. No backdoors. Hardware-enforced privacy.     ║
║ Encrypted in Enclaves. Zero-Access Storage. Total Data Sovereignty  ║
╚═════════════════════════════════════════════════════════════════════╝
`));

        console.log(chalk.bold.green('✅ Setup Complete!\n'));
        console.log(`   ${chalk.gray('Address:')} ${chalk.cyan(address)}`);
        console.log(`   ${chalk.gray('Short:')}   ${chalk.cyan(shortenAddress(address))}`);
        console.log(`   ${chalk.gray('Config:')}  ~/.pribado/config.json\n`);

        console.log(chalk.bold('Next steps:'));
        console.log(`   ${chalk.yellow('pribado keys add')}    - Add your first API key`);
        console.log(`   ${chalk.yellow('pribado keys')}        - View your API keys`);
        console.log(`   ${chalk.yellow('pribado keys revoke')} - Revoke an API key`);
        console.log(`   ${chalk.yellow('pribado whoami')}      - Show wallet info`);
        console.log(`   ${chalk.yellow('pribado --help')}      - See all commands\n`);
    } catch (error) {
        spinner.fail('Failed to save configuration');
        console.log(chalk.red(`\n${error}\n`));
    }
}
