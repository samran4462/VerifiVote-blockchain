# VerifiVote - Blockchain

Smart contracts for the VerifiVote AI-Driven Decentralized Voting Platform. Built with Solidity, Hardhat, OpenZeppelin Upgradeable Contracts, and deployed to the Ethereum Sepolia Testnet.

## Architecture & Smart Contracts
- **`ElectionFactory.sol`**: UUPS upgradeable factory contract that clones and deploys isolated `ElectionProxy` instances for each newly created election.
- **`Election.sol`**: Core election smart contract utilizing OpenZeppelin `Initializable`, `OwnableUpgradeable`, and `UUPSUpgradeable`. Features:
  - Role-based restrictions (`onlyOwner`, `onlyNonCandidate`, `onlyNonVoter`).
  - Single-use Election Voting Token (`EVT`) minting and burning.
  - Gas-free voter onboarding via Admin delegated token issuance (`issueToken`).
  - Direct on-chain candidate registration with ECDSA backend authorization signatures.
  - Live vote casting with `VoteCast` event emission.
  - Draw/tie resolution mechanics.

## Deployment Details
- **Network:** Ethereum Sepolia Testnet
- **Factory Address:** `0x30C7632DFF19271806be70B69804044f94DD247b`

## Setup & Compilation

Install dependencies:
```bash
npm install
```

Configure your environment variables:
```bash
cp .env.example .env
```
Fill in your Sepolia RPC URL, private key, and Etherscan API key.

Compile contracts:
```bash
npx hardhat compile
```

Run test suite:
```bash
npx hardhat test
```

Deploy to Sepolia:
```bash
npx hardhat run scripts/deploy_v2.js --network sepolia
```
