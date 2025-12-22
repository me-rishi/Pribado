const hre = require("hardhat");
const { ethers } = require("hardhat");
const { randomBytes } = require("crypto");

async function main() {
    console.log("🚀 Deploying EnclaveKeyManager to Sapphire...");

    // Get the initial secret (Master Key)
    const existingSecret = process.env.ENCLAVE_SECRET;

    let initialKey;

    if (existingSecret && existingSecret.length === 64) {
        console.log("Using existing ENCLAVE_SECRET from env...");
        initialKey = "0x" + existingSecret;
    } else {
        console.log("Generating NEW random 32-byte master key...");
        initialKey = "0x" + randomBytes(32).toString("hex");
        console.log("⚠️  NEW KEY GENERATED:", initialKey.slice(2));
        console.log("    Copy this to your .env.local as ENCLAVE_SECRET if you want to use it!");
    }

    // Deploy the contract
    const EnclaveKeyManager = await ethers.getContractFactory("EnclaveKeyManager");

    // The transaction data (including initialKey) is ENCRYPTED by the Oasis Sapphire wrapper
    const keyManager = await EnclaveKeyManager.deploy(initialKey);

    await keyManager.waitForDeployment();
    const address = await keyManager.getAddress();

    console.log(`✅ EnclaveKeyManager deployed to: ${address}`);
    // In v6, runner is typically the signer
    console.log(`🔐 Owner: ${keyManager.runner ? keyManager.runner.address : "unknown"}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
