require("@nomicfoundation/hardhat-toolbox");
require("@oasisprotocol/sapphire-hardhat");
require("dotenv").config({ path: "../.env.local" });

const PRIVATE_KEY = process.env.SAPPHIRE_PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.28",
    networks: {
        sapphire_testnet: {
            url: "https://testnet.sapphire.oasis.dev",
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
            chainId: 23295,
        },
        sapphire_mainnet: {
            url: "https://sapphire.oasis.io",
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
            chainId: 23294,
        },
    },
};
