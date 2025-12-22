#!/usr/bin/env node
"use strict";
/**
 * Pribado CLI - Command-line interface for Pribado Private API
 * https://pribado.dev
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const init_js_1 = require("./commands/init.js");
const keys_js_1 = require("./commands/keys.js");
const whoami_js_1 = require("./commands/whoami.js");
const logout_js_1 = require("./commands/logout.js");
const program = new commander_1.Command();
// ASCII art banner
const banner = chalk_1.default.cyan(`
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
    await (0, init_js_1.initCommand)();
});
// Keys command with subcommands
const keysCmd = program
    .command('keys')
    .description('Manage your API keys');
keysCmd
    .command('list', { isDefault: true })
    .description('List all API keys')
    .action(async () => {
    await (0, keys_js_1.keysCommand)();
});
keysCmd
    .command('add')
    .description('Add and provision a new API key')
    .action(async () => {
    await (0, keys_js_1.keysAddCommand)();
});
keysCmd
    .command('revoke [keyId]')
    .description('Revoke an API key')
    .option('-a, --all', 'Revoke all API keys')
    .action(async (keyId, options) => {
    await (0, keys_js_1.keysRevokeCommand)(keyId, options.all);
});
program
    .command('whoami')
    .description('Show current wallet info')
    .action(async () => {
    await (0, whoami_js_1.whoamiCommand)();
});
program
    .command('login')
    .description('Unlock your wallet')
    .action(async () => {
    await (0, whoami_js_1.whoamiCommand)();
});
program
    .command('logout')
    .description('Clear local configuration')
    .action(async () => {
    await (0, logout_js_1.logoutCommand)();
});
// Default action: show help
program
    .action(() => {
    program.help();
});
// Handle no arguments
if (process.argv.length === 2) {
    console.log(banner);
    console.log(chalk_1.default.gray('Run `pribado --help` for available commands.\n'));
    console.log(chalk_1.default.bold('Quick Start:'));
    console.log(`   ${chalk_1.default.yellow('pribado init')}   - Set up your wallet`);
    console.log(`   ${chalk_1.default.yellow('pribado keys')}   - View your API keys`);
    console.log(`   ${chalk_1.default.yellow('pribado whoami')} - Show wallet info\n`);
}
else {
    program.parse();
}
//# sourceMappingURL=index.js.map