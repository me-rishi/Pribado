"use strict";
/**
 * Whoami Command - Show current wallet info
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoamiCommand = whoamiCommand;
const chalk_1 = __importDefault(require("chalk"));
const config_js_1 = require("../lib/config.js");
const wallet_js_1 = require("../lib/wallet.js");
async function whoamiCommand() {
    if (!(0, config_js_1.configExists)()) {
        console.log(chalk_1.default.yellow('\n⚠️  No wallet configured.'));
        console.log(chalk_1.default.gray('   Run `pribado init` to get started.\n'));
        return;
    }
    const config = (0, config_js_1.getPublicConfig)();
    if (!config) {
        console.log(chalk_1.default.red('\n❌ Failed to read configuration.\n'));
        return;
    }
    console.log(chalk_1.default.bold.cyan('\n👤 Pribado Wallet Info\n'));
    console.log(`   ${chalk_1.default.gray('Address:')}     ${chalk_1.default.green(config.address)}`);
    console.log(`   ${chalk_1.default.gray('Short:')}       ${chalk_1.default.green((0, wallet_js_1.shortenAddress)(config.address))}`);
    console.log(`   ${chalk_1.default.gray('API Server:')} ${chalk_1.default.gray(config.apiEndpoint)}`);
    console.log(`   ${chalk_1.default.gray('Created:')}     ${chalk_1.default.gray(new Date(config.createdAt).toLocaleString())}\n`);
    console.log(chalk_1.default.gray('Commands:'));
    console.log(`   ${chalk_1.default.yellow('pribado keys')}   - View your API keys`);
    console.log(`   ${chalk_1.default.yellow('pribado logout')} - Clear local configuration\n`);
}
//# sourceMappingURL=whoami.js.map