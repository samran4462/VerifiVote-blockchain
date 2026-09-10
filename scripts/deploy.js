import hre from "hardhat";

async function main() {
  console.log("Starting deployment...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy ElectionFactory
  const ElectionFactory = await hre.ethers.getContractFactory("ElectionFactory");
  const electionFactory = await ElectionFactory.deploy();

  await electionFactory.waitForDeployment();
  const address = await electionFactory.getAddress();
  
  console.log("ElectionFactory successfully deployed to:", address);
  console.log("Waiting for 5 block confirmations...");
  
  // Wait for 5 block confirmations
  const deployTx = electionFactory.deploymentTransaction();
  await deployTx.wait(5);
  
  console.log("5 block confirmations received.");

  console.log("\nTo verify the contract on Etherscan, run:");
  console.log(`npx hardhat verify --network sepolia ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
