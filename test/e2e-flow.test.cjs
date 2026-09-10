const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("E2E Election Lifecycle (Phase 12 Integration Test)", function () {
  let ElectionFactory, electionFactory;
  let ElectionMaster, electionMaster;
  let electionContract; // The deployed proxy instance
  
  let admin;
  let backendVerifier;
  let voter;
  let candidateWallet;
  
  const electionId = 1001;

  before(async function () {
    [admin, backendVerifier, voter, candidateWallet] = await ethers.getSigners();

    // 1. Deploy Master Implementation
    ElectionMaster = await ethers.getContractFactory("Election");
    electionMaster = await ElectionMaster.deploy();
    await electionMaster.waitForDeployment();

    // 2. Deploy Factory (UUPS pattern typically uses ERC1967Proxy but for tests we deploy implementation first, 
    // then deploy ERC1967Proxy pointing to it, or just deploy it standard if it's simplified.
    // Wait, ElectionFactory inherits Initializable, UUPSUpgradeable. Let's deploy it directly or via proxy.
    // To simplify the test, we can just deploy the factory and manually call initialize. 
    // Usually OpenZeppelin Upgrades handles this, but since we had ESM issues before, let's deploy manually.)
    
    const FactoryImplementation = await ethers.getContractFactory("ElectionFactory");
    const factoryImpl = await FactoryImplementation.deploy();
    await factoryImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = factoryImpl.interface.encodeFunctionData("initialize", [await electionMaster.getAddress()]);
    
    const factoryProxy = await ERC1967Proxy.deploy(await factoryImpl.getAddress(), initData);
    await factoryProxy.waitForDeployment();

    electionFactory = await ethers.getContractAt("ElectionFactory", await factoryProxy.getAddress());
  });

  it("Step 1: Admin drafts and deploys election on-chain via Factory", async function () {
    const tx = await electionFactory.connect(admin).createElection(electionId, backendVerifier.address);
    const receipt = await tx.wait();

    // Extract Proxy address from ElectionCreated event
    const event = receipt.logs.find(log => {
        try { return electionFactory.interface.parseLog(log).name === "ElectionCreated"; } 
        catch (e) { return false; }
    });
    const parsedEvent = electionFactory.interface.parseLog(event);
    const electionProxyAddress = parsedEvent.args.electionAddress;

    electionContract = await ethers.getContractAt("Election", electionProxyAddress);
    
    expect(await electionContract.electionId()).to.equal(electionId);
    expect(await electionContract.backendVerifier()).to.equal(backendVerifier.address);
    expect(await electionContract.state()).to.equal(0); // Draft
  });

  it("Step 2: Backend AI KYC signs payload and Candidate registers", async function () {
    // Backend generates signature for CANDIDATE
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "string"],
      [candidateWallet.address, electionId, "CANDIDATE"]
    );
    const signature = await backendVerifier.signMessage(ethers.getBytes(messageHash));

    // Candidate registers paying their own gas
    await expect(
      electionContract.connect(candidateWallet).registerCandidate("Alice The Independent", signature)
    ).to.emit(electionContract, "CandidateAdded").withArgs(1, candidateWallet.address);

    const c = await electionContract.candidates(1);
    expect(c.name).to.equal("Alice The Independent");
  });

  it("Step 3: Admin starts the election", async function () {
    await expect(electionContract.connect(admin).startElection())
      .to.emit(electionContract, "VotingStarted");
    
    expect(await electionContract.state()).to.equal(1); // Active
  });

  it("Step 4: Backend AI KYC signs payload and Voter purchases token", async function () {
    // Backend generates signature for VOTER
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "string"],
      [voter.address, electionId, "VOTER"]
    );
    const signature = await backendVerifier.signMessage(ethers.getBytes(messageHash));

    // Voter buys token (pays own gas)
    await expect(
      electionContract.connect(voter).purchaseVotingToken(signature)
    ).to.emit(electionContract, "TokenPurchased").withArgs(voter.address);

    expect(await electionContract.hasToken(voter.address)).to.be.true;
  });

  it("Step 5: Voter casts vote on-chain", async function () {
    await expect(
      electionContract.connect(voter).castVote(1) // Voting for candidate 1
    ).to.emit(electionContract, "VoteCast").withArgs(voter.address, 1);

    expect(await electionContract.hasToken(voter.address)).to.be.false;
    expect(await electionContract.hasVoted(voter.address)).to.be.true;

    const c = await electionContract.candidates(1);
    expect(c.voteCount).to.equal(1);
  });

  it("Step 6: Time travels 10 minutes & Admin resolves election", async function () {
    // Attempting to resolve early should fail
    await expect(electionContract.connect(admin).resolveElection()).to.be.revertedWith("Voting still open");

    // Fast forward time by 10 minutes and 1 second
    await time.increase(601);

    await expect(electionContract.connect(admin).resolveElection())
      .to.emit(electionContract, "ElectionResolved").withArgs(2, 1); // State 2 = Completed, Winner = 1

    expect(await electionContract.state()).to.equal(2);
    expect(await electionContract.winnerId()).to.equal(1);
  });
});
