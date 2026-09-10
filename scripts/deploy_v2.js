import hardhat from "hardhat";
const { ethers } = hardhat;

async function main() {
    console.log("Starting V2 UUPS Deployment to Sepolia...");
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // 1. Deploy the Election V2 Implementation
    console.log("\nDeploying Election V2 Master Implementation...");
    const Election = await ethers.getContractFactory("Election");
    const electionImpl = await Election.deploy();
    await electionImpl.waitForDeployment();
    const electionImplAddress = await electionImpl.getAddress();
    console.log("Election V2 Implementation deployed at:", electionImplAddress);

    // 2. Deploy the ElectionFactory Implementation
    console.log("\nDeploying ElectionFactory Implementation...");
    const ElectionFactory = await ethers.getContractFactory("ElectionFactory");
    const factoryImpl = await ElectionFactory.deploy();
    await factoryImpl.waitForDeployment();
    const factoryImplAddress = await factoryImpl.getAddress();
    console.log("ElectionFactory Implementation deployed at:", factoryImplAddress);

    // 3. Deploy the ERC1967Proxy pointing to FactoryImpl
    console.log("\nDeploying ERC1967Proxy for ElectionFactory...");
    
    // Encode the initialize call
    const initData = ElectionFactory.interface.encodeFunctionData("initialize", [electionImplAddress]);
    
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await ERC1967Proxy.deploy(factoryImplAddress, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    
    console.log("ElectionFactory UUPS Proxy deployed at:", proxyAddress);

    console.log("\n--- Deployment Complete ---");
    console.log("Please wait for 5 block confirmations before verifying...");
    
    // Wait for 5 blocks
    console.log("Waiting for 5 block confirmations on proxy deployment...");
    const receipt = await proxy.deploymentTransaction().wait(5);
    console.log("Confirmed 5 blocks!");

    console.log("\nRun the following to verify your contracts on Etherscan:");
    console.log(`npx hardhat verify --network sepolia ${electionImplAddress}`);
    console.log(`npx hardhat verify --network sepolia ${factoryImplAddress}`);
    console.log(`npx hardhat verify --network sepolia ${proxyAddress} ${factoryImplAddress} ${initData}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
