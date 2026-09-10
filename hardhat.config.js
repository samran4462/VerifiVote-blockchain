import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

let privateKey = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.trim() : "";
if (privateKey && !privateKey.startsWith("0x")) {
  privateKey = "0x" + privateKey;
}

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ? process.env.SEPOLIA_RPC_URL.trim() : "",
      accounts: privateKey ? [privateKey] : [],
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ? process.env.ETHERSCAN_API_KEY.trim() : ""
  }
};

export default config;
