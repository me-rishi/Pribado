const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Deploying EnclaveKeyManager to Sapphire...");
    console.log("");
    console.log("🔐 SECURITY: Key will be generated ON-CHAIN inside the TEE.");
    console.log("   No key is passed in transaction calldata - fully secure!");
    console.log("");

    // Deploy the contract (no constructor arguments needed!)
    // Use fully qualified name to avoid conflict with flattened version
    const EnclaveKeyManager = await ethers.getContractFactory("contracts/EnclaveKeyManager.sol:EnclaveKeyManager");

    // Deploy - the key is generated inside the contract using Sapphire.randomBytes()
    const keyManager = await EnclaveKeyManager.deploy();

    await keyManager.waitForDeployment();
    const address = await keyManager.getAddress();

    console.log(`✅ EnclaveKeyManager deployed to: ${address}`);

    // Get owner info
    const owner = keyManager.runner?.address || "unknown";
    console.log(`🔐 Owner: ${owner}`);

    console.log("");
    console.log("📋 NEXT STEPS:");
    console.log("   1. The master key was generated securely inside the TEE");
    console.log("   2. To retrieve it, call getSecret() from your server using sapphire-wrapped provider");
    console.log("   3. Only the owner wallet can retrieve the key");
    console.log("");
    console.log("🔄 To rotate the key (if compromised):");
    console.log("   Call rotateKey() - a NEW random key will be generated securely on-chain");
    console.log("");
    console.log("📥 To migrate existing ENCLAVE_SECRET:");
    console.log("   Call injectKey(bytes32) via ENCRYPTED Sapphire transaction (NOT ABI playground!)");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
