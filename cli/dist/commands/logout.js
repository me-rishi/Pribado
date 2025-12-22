"use strict";
/**
 * Logout Command - Clear local configuration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutCommand = logoutCommand;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const config_js_1 = require("../lib/config.js");
async function logoutCommand() {
    if (!(0, config_js_1.configExists)()) {
        console.log(chalk_1.default.yellow('\n⚠️  No wallet configured. Nothing to logout.\n'));
        return;
    }
    const config = (0, config_js_1.getPublicConfig)();
    console.log(chalk_1.default.bold.yellow('\n⚠️  Warning: This will delete your local configuration.\n'));
    console.log(`   Wallet: ${chalk_1.default.green(config?.address)}\n`);
    console.log(chalk_1.default.gray('   Your seed phrase will NOT be recoverable from this machine.'));
    console.log(chalk_1.default.gray('   Make sure you have it backed up elsewhere.\n'));
    const { confirmed } = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure you want to delete your local wallet?',
            default: false,
        },
    ]);
    if (!confirmed) {
        console.log(chalk_1.default.gray('\nCancelled.\n'));
        return;
    }
    try {
        (0, config_js_1.deleteConfig)();
        console.log(chalk_1.default.green('\n✅ Local configuration deleted.\n'));
        console.log(chalk_1.default.gray('   Run `pribado init` to set up a new wallet or import your seed.\n'));
    }
    catch (error) {
        console.log(chalk_1.default.red(`\n❌ Failed to delete configuration: ${error}\n`));
    }
}
//# sourceMappingURL=logout.js.map