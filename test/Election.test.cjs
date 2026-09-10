const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Voting Management System", function () {
  let ElectionFactory, electionFactory;
  let Election, election;
  let owner, backendVerifier, admin, voter1, voter2, candidate1, candidate2, nonVoter;
  let electionId = 1;

  beforeEach(async function () {
    [owner, backendVerifier, admin, voter1, voter2, candidate1, candidate2, nonVoter] = await ethers.getSigners();

    ElectionFactory = await ethers.getContractFactory("ElectionFactory");
    electionFactory = await ElectionFactory.deploy();
    
    const tx = await electionFactory.connect(admin).createElection(electionId, backendVerifier.address);
    const receipt = await tx.wait();
    const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'ElectionCreated');
    const electionAddress = event.args.electionAddress;

    Election = await ethers.getContractFactory("Election");
    election = Election.attach(electionAddress);
  });

  async function generateSignature(signer, address, eId) {
    const hash = ethers.solidityPackedKeccak256(["address", "uint256"], [address, eId]);
    const signature = await signer.signMessage(ethers.getBytes(hash));
    return signature;
  }

  describe("Role Exclusions", function () {
    it("Should prevent a candidate from buying a voting token", async function () {
      const tx = await electionFactory.connect(admin).createElection(2, backendVerifier.address);
      const receipt = await tx.wait();
      const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'ElectionCreated');
      const election2 = Election.attach(event.args.electionAddress);

      await election2.connect(admin).addCandidate(1, "Alice", candidate1.address);
      await election2.connect(admin).startElection();

      const sigCandidate = await generateSignature(backendVerifier, candidate1.address, 2);
      await expect(
        election2.connect(candidate1).purchaseVotingToken(sigCandidate)
      ).to.be.revertedWith("Candidate cannot be voter");
    });
  });

  describe("ECDSA Signatures & Token Minting", function () {
    beforeEach(async function () {
      await election.connect(admin).addCandidate(1, "Alice", candidate1.address);
      await election.connect(admin).startElection();
    });

    it("Should allow purchasing token with valid backend signature", async function () {
      const sig = await generateSignature(backendVerifier, voter1.address, electionId);
      await election.connect(voter1).purchaseVotingToken(sig);
      expect(await election.hasToken(voter1.address)).to.be.true;
      expect(await election.isVoter(voter1.address)).to.be.true;
    });

    it("Should reject invalid signature (wrong signer)", async function () {
      const sig = await generateSignature(nonVoter, voter1.address, electionId);
      await expect(
        election.connect(voter1).purchaseVotingToken(sig)
      ).to.be.revertedWith("Invalid signature or not 18+");
    });
    
    it("Should reject if signature is used by a different address", async function () {
      const sig = await generateSignature(backendVerifier, voter1.address, electionId);
      await expect(
        election.connect(voter2).purchaseVotingToken(sig)
      ).to.be.revertedWith("Invalid signature or not 18+");
    });
  });

  describe("Token Burn & Voting", function () {
    beforeEach(async function () {
      await election.connect(admin).addCandidate(1, "Alice", candidate1.address);
      await election.connect(admin).startElection();
    });

    it("Should burn token upon voting and prevent double voting", async function () {
      const sig = await generateSignature(backendVerifier, voter1.address, electionId);
      await election.connect(voter1).purchaseVotingToken(sig);
      
      expect(await election.hasToken(voter1.address)).to.be.true;

      await election.connect(voter1).castVote(1);

      expect(await election.hasToken(voter1.address)).to.be.false;
      expect(await election.hasVoted(voter1.address)).to.be.true;

      await expect(
        election.connect(voter1).castVote(1)
      ).to.be.revertedWith("Must purchase token first");
    });
  });

  describe("10-Minute Lock & Tie-Breaker Draw", function () {
    beforeEach(async function () {
      await election.connect(admin).addCandidate(1, "Alice", candidate1.address);
      await election.connect(admin).addCandidate(2, "Bob", candidate2.address);
      await election.connect(admin).startElection();
    });

    it("Should revert votes after 10 minutes", async function () {
      const sig = await generateSignature(backendVerifier, voter1.address, electionId);
      await election.connect(voter1).purchaseVotingToken(sig);

      await time.increase(10 * 60 + 1);

      await expect(
        election.connect(voter1).castVote(1)
      ).to.be.revertedWith("Voting window closed");
    });

    it("Should resolve to Draw state if there is a tie", async function () {
      const sig1 = await generateSignature(backendVerifier, voter1.address, electionId);
      await election.connect(voter1).purchaseVotingToken(sig1);
      await election.connect(voter1).castVote(1);

      const sig2 = await generateSignature(backendVerifier, voter2.address, electionId);
      await election.connect(voter2).purchaseVotingToken(sig2);
      await election.connect(voter2).castVote(2);

      await time.increase(10 * 60 + 1);
      await election.connect(admin).resolveElection();

      const state = await election.state();
      expect(state).to.equal(3n); // 3 = Draw
    });

    it("Should resolve to Completed and declare winner if no tie", async function () {
      const sig1 = await generateSignature(backendVerifier, voter1.address, electionId);
      await election.connect(voter1).purchaseVotingToken(sig1);
      await election.connect(voter1).castVote(2);

      await time.increase(10 * 60 + 1);
      await election.connect(admin).resolveElection();

      const state = await election.state();
      expect(state).to.equal(2n); // 2 = Completed
      
      const winnerId = await election.winnerId();
      expect(winnerId).to.equal(2n);
    });
  });
});
