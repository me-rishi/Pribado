/**
 * Whoami Command - Show current wallet info
 */

import chalk from 'chalk';
import { configExists, getPublicConfig } from '../lib/config.js';
import { shortenAddress } from '../lib/wallet.js';

export async function whoamiCommand(): Promise<void> {
    if (!configExists()) {
        console.log(chalk.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk.gray('   Run `pribado init` to get started.\n'));
        return;
    }

    const config = getPublicConfig();

    if (!config) {
        console.log(chalk.red('\n❌ Failed to read configuration.\n'));
        return;
    }

    console.log(chalk.bold.cyan('\n👤 Pribado Wallet Info\n'));
    console.log(`   ${chalk.gray('Address:')}     ${chalk.green(config.address)}`);
    console.log(`   ${chalk.gray('Short:')}       ${chalk.green(shortenAddress(config.address))}`);
    console.log(`   ${chalk.gray('API Server:')} ${chalk.gray(config.apiEndpoint)}`);
    console.log(`   ${chalk.gray('Created:')}     ${chalk.gray(new Date(config.createdAt).toLocaleString())}\n`);

    console.log(chalk.gray('Commands:'));
    console.log(`   ${chalk.yellow('pribado keys')}   - View your API keys`);
    console.log(`   ${chalk.yellow('pribado logout')} - Clear local configuration\n`);
}
