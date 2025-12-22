#!/usr/bin/env node
/**
 * Pribado CLI - Command-line interface for Pribado Private API
 * https://pribado.dev
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { keysCommand, keysAddCommand, keysRevokeCommand } from './commands/keys.js';
import { whoamiCommand } from './commands/whoami.js';
import { logoutCommand } from './commands/logout.js';

const program = new Command();

// ASCII art banner
const banner = chalk.cyan(`
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
`);

program
    .name('pribado')
    .description('Command-line interface for Pribado Private API')
    .version('1.0.41')
    .addHelpText('before', banner);

program
    .command('init')
    .description('Create or import a wallet')
    .action(async () => {
        await initCommand();
    });

// Keys command with subcommands
const keysCmd = program
    .command('keys')
    .description('Manage your API keys');

keysCmd
    .command('list', { isDefault: true })
    .description('List all API keys')
    .action(async () => {
        await keysCommand();
    });

keysCmd
    .command('add')
    .description('Add and provision a new API key')
    .action(async () => {
        await keysAddCommand();
    });

keysCmd
    .command('revoke [keyId]')
    .description('Revoke an API key')
    .option('-a, --all', 'Revoke all API keys')
    .action(async (keyId, options) => {
        await keysRevokeCommand(keyId, options.all);
    });

program
    .command('whoami')
    .description('Show current wallet info')
    .action(async () => {
        await whoamiCommand();
    });

program
    .command('login')
    .description('Unlock your wallet')
    .action(async () => {
        await whoamiCommand();
    });

program
    .command('logout')
    .description('Clear local configuration')
    .action(async () => {
        await logoutCommand();
    });

// Default action: show help
program
    .action(() => {
        program.help();
    });

// Handle no arguments
if (process.argv.length === 2) {
    console.log(banner);
    console.log(chalk.gray('Run `pribado --help` for available commands.\n'));
    console.log(chalk.bold('Quick Start:'));
    console.log(`   ${chalk.yellow('pribado init')}   - Set up your wallet`);
    console.log(`   ${chalk.yellow('pribado keys')}   - View your API keys`);
    console.log(`   ${chalk.yellow('pribado whoami')} - Show wallet info\n`);
} else {
    program.parse();
}
