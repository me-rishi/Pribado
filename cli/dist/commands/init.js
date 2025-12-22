"use strict";
/**
 * Init Command - Create or import wallet
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = initCommand;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_js_1 = require("../lib/wallet.js");
const config_js_1 = require("../lib/config.js");
async function initCommand() {
    console.log(chalk_1.default.bold.cyan('\n🔐 Pribado CLI Setup\n'));
    // Check if already configured
    if ((0, config_js_1.configExists)()) {
        const config = (0, config_js_1.getPublicConfig)();
        console.log(chalk_1.default.yellow('⚠️  Existing configuration found:'));
        console.log(`   Address: ${chalk_1.default.green(config?.address)}\n`);
        const { overwrite } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: 'Do you want to overwrite with a new wallet?',
                default: false,
            },
        ]);
        if (!overwrite) {
            console.log(chalk_1.default.gray('\nSetup cancelled. Use `pribado login` to unlock.\n'));
            return;
        }
    }
    // Ask: Create or Import
    const { action } = await inquirer_1.default.prompt([
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
    let seedPhrase;
    if (action === 'create') {
        // Generate new seed phrase
        seedPhrase = (0, wallet_js_1.generateSeedPhrase)();
        console.log(chalk_1.default.bold.yellow('\n⚠️  IMPORTANT: Write down your seed phrase!\n'));
        console.log(chalk_1.default.bgBlack.white('  ' + seedPhrase + '  '));
        console.log(chalk_1.default.red('\n⛔ Never share this with anyone. Store it securely offline.\n'));
        const { confirmed } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: 'I have securely stored my seed phrase',
                default: false,
            },
        ]);
        if (!confirmed) {
            console.log(chalk_1.default.red('\n❌ Please store your seed phrase before continuing.\n'));
            return;
        }
    }
    else {
        // Import existing seed phrase
        const { seed } = await inquirer_1.default.prompt([
            {
                type: 'password',
                name: 'seed',
                message: 'Enter your 12 or 24 word seed phrase:',
                mask: '*',
                validate: (input) => {
                    if ((0, wallet_js_1.isValidSeedPhrase)(input)) {
                        return true;
                    }
                    return 'Invalid seed phrase. Please enter a valid BIP-39 mnemonic.';
                },
            },
        ]);
        seedPhrase = seed;
    }
    // Set encryption password
    const { password, confirmPassword } = await inquirer_1.default.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Create a password to encrypt your wallet:',
            mask: '*',
            validate: (input) => {
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
        console.log(chalk_1.default.red('\n❌ Passwords do not match.\n'));
        return;
    }
    // Default to testnet
    const network = 'testnet';
    // Save config
    const spinner = (0, ora_1.default)('Setting up wallet...').start();
    try {
        const address = (0, wallet_js_1.getAddressFromSeed)(seedPhrase);
        (0, config_js_1.saveConfig)(address, seedPhrase, password, network);
        spinner.succeed('Wallet configured successfully!');
        // Show banner
        console.log(chalk_1.default.cyan(`
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
        console.log(chalk_1.default.bold.green('✅ Setup Complete!\n'));
        console.log(`   ${chalk_1.default.gray('Address:')} ${chalk_1.default.cyan(address)}`);
        console.log(`   ${chalk_1.default.gray('Short:')}   ${chalk_1.default.cyan((0, wallet_js_1.shortenAddress)(address))}`);
        console.log(`   ${chalk_1.default.gray('Config:')}  ~/.pribado/config.json\n`);
        console.log(chalk_1.default.bold('Next steps:'));
        console.log(`   ${chalk_1.default.yellow('pribado keys add')}    - Add your first API key`);
        console.log(`   ${chalk_1.default.yellow('pribado keys')}        - View your API keys`);
        console.log(`   ${chalk_1.default.yellow('pribado keys revoke')} - Revoke an API key`);
        console.log(`   ${chalk_1.default.yellow('pribado whoami')}      - Show wallet info`);
        console.log(`   ${chalk_1.default.yellow('pribado --help')}      - See all commands\n`);
    }
    catch (error) {
        spinner.fail('Failed to save configuration');
        console.log(chalk_1.default.red(`\n${error}\n`));
    }
}
//# sourceMappingURL=init.js.map