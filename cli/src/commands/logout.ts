/**
 * Logout Command - Clear local configuration
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { configExists, deleteConfig, getPublicConfig } from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
    if (!configExists()) {
        console.log(chalk.yellow('\n⚠️  No wallet configured. Nothing to logout.\n'));
        return;
    }

    const config = getPublicConfig();

    console.log(chalk.bold.yellow('\n⚠️  Warning: This will delete your local configuration.\n'));
    console.log(`   Wallet: ${chalk.green(config?.address)}\n`);
    console.log(chalk.gray('   Your seed phrase will NOT be recoverable from this machine.'));
    console.log(chalk.gray('   Make sure you have it backed up elsewhere.\n'));

    const { confirmed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure you want to delete your local wallet?',
            default: false,
        },
    ]);

    if (!confirmed) {
        console.log(chalk.gray('\nCancelled.\n'));
        return;
    }

    try {
        deleteConfig();
        console.log(chalk.green('\n✅ Local configuration deleted.\n'));
        console.log(chalk.gray('   Run `pribado init` to set up a new wallet or import your seed.\n'));
    } catch (error) {
        console.log(chalk.red(`\n❌ Failed to delete configuration: ${error}\n`));
    }
}
