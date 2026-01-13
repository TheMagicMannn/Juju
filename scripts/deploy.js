const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { AaveV3Base, AaveV3BaseSepolia } = require('@bgd-labs/aave-address-book');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Determine the network
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.name === "base";
  const isSepolia = network.name === "base-sepolia" || network.name === "sepolia" || network.name === "unknown";

  let poolAddressesProvider;
  let networkName;

  if (isMainnet) {
    poolAddressesProvider = AaveV3Base.POOL_ADDRESSES_PROVIDER;
    networkName = "base";
    console.log("Using Aave V3 Base mainnet addresses.");
  } else if (isSepolia) {
    poolAddressesProvider = AaveV3BaseSepolia.POOL_ADDRESSES_PROVIDER;
    networkName = "baseSepolia";
    console.log("Using Aave V3 Base Sepolia addresses.");
  } else {
    throw new Error(`Unsupported network: ${network.name}`);
  }

  if (!poolAddressesProvider) {
      throw new Error("Could not find POOL_ADDRESSES_PROVIDER for the current network.");
  }

  console.log(`PoolAddressesProvider for ${networkName}:`, poolAddressesProvider);

  // Deploy the contract
  const BaseAlphaArb = await ethers.getContractFactory("BaseAlphaArb");
  const baseAlphaArb = await BaseAlphaArb.deploy(poolAddressesProvider);
  await baseAlphaArb.waitForDeployment();

  const deployedAddress = await baseAlphaArb.getAddress();
  console.log("BaseAlphaArb deployed to:", deployedAddress);

  // Load or create config to save the new contract address
  const configPath = path.join(__dirname, "../config/config.json");
  let config = {};
  if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  if (!config.contractAddress) {
      config.contractAddress = {};
  }

  // Save the contract address to the config file
  config.contractAddress[networkName] = deployedAddress;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`Contract address for ${networkName} saved to config.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
