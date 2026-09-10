// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Election is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 public electionId;
    address public backendVerifier;
    
    uint256 public startTime;
    uint256 public constant VOTING_DURATION = 10 minutes;

    enum ElectionState { Draft, Active, Completed, Draw, Cancelled }
    ElectionState public state;

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    mapping(uint256 => Candidate) public candidates;
    uint256[] public candidateIds;

    mapping(address => bool) public isCandidateAddress;
    mapping(address => bool) public isVoter;

    mapping(address => bool) public hasToken;
    mapping(address => bool) public hasVoted;

    uint256 public winnerId;

    event CandidateAdded(uint256 indexed candidateId, address indexed candidateAddress);
    event VotingStarted(uint256 startTime);
    event TokenPurchased(address indexed voter);
    event VoteCast(address indexed voter, uint256 indexed candidateId);
    event ElectionResolved(ElectionState finalState, uint256 winnerId);

    modifier inState(ElectionState _state) {
        require(state == _state, "Invalid state");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _electionId, address _admin, address _backendVerifier) public initializer {
        __Ownable_init(_admin);
        
        electionId = _electionId;
        backendVerifier = _backendVerifier;
        state = ElectionState.Draft;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Self-registration for candidates paying their own gas. Requires backend signature.
     */
    function registerCandidate(string memory _name, bytes calldata signature) external inState(ElectionState.Draft) nonReentrant {
        require(msg.sender != owner(), "Admin cannot be candidate");
        require(!isVoter[msg.sender], "Voter cannot be candidate");
        require(!isCandidateAddress[msg.sender], "Already registered as candidate");

        // Verify the KYC signature from the backend specifically for candidates
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, electionId, "CANDIDATE"));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        
        address signer = ethSignedMessageHash.recover(signature);
        require(signer == backendVerifier, "Invalid signature or KYC failed");

        uint256 newCandidateId = candidateIds.length + 1;

        candidates[newCandidateId] = Candidate({ id: newCandidateId, name: _name, voteCount: 0 });
        candidateIds.push(newCandidateId);
        isCandidateAddress[msg.sender] = true;

        emit CandidateAdded(newCandidateId, msg.sender);
    }

    /**
     * @dev Admin manually issues a voting token to a verified user without them paying gas
     */
    function issueToken(address voter) external onlyOwner nonReentrant {
        require(voter != owner(), "Admin cannot be voter");
        require(!isCandidateAddress[voter], "Candidate cannot be voter");
        require(!isVoter[voter], "Already registered as voter");
        require(!hasToken[voter] && !hasVoted[voter], "Token already acquired or used");

        isVoter[voter] = true;
        hasToken[voter] = true;
        emit TokenPurchased(voter);
    }

    function startElection() external onlyOwner inState(ElectionState.Draft) {
        require(candidateIds.length > 0, "No candidates");
        state = ElectionState.Active;
        startTime = block.timestamp;
        emit VotingStarted(startTime);
    }

    /**
     * @dev User acquires exactly one voting token if they have a valid signature from backend (proving 18+ age)
     */
    function purchaseVotingToken(bytes calldata signature) external inState(ElectionState.Active) nonReentrant {
        require(msg.sender != owner(), "Admin cannot be voter");
        require(!isCandidateAddress[msg.sender], "Candidate cannot be voter");
        require(!isVoter[msg.sender], "Already registered as voter");
        require(!hasToken[msg.sender] && !hasVoted[msg.sender], "Token already acquired or used");

        // Verify the signature from the backend specifically for voters
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, electionId, "VOTER"));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        
        address signer = ethSignedMessageHash.recover(signature);
        require(signer == backendVerifier, "Invalid signature or not 18+");

        isVoter[msg.sender] = true;
        hasToken[msg.sender] = true;
        emit TokenPurchased(msg.sender);
    }

    function castVote(uint256 _candidateId) external inState(ElectionState.Active) nonReentrant {
        require(block.timestamp <= startTime + VOTING_DURATION, "Voting window closed");
        require(hasToken[msg.sender], "Must purchase token first");
        require(!hasVoted[msg.sender], "Already voted");
        require(bytes(candidates[_candidateId].name).length != 0, "Invalid candidate");

        hasToken[msg.sender] = false;
        hasVoted[msg.sender] = true;
        
        candidates[_candidateId].voteCount += 1;
        emit VoteCast(msg.sender, _candidateId);
    }

    function resolveElection() external onlyOwner nonReentrant {
        require(state == ElectionState.Active, "Election not active");
        require(block.timestamp > startTime + VOTING_DURATION, "Voting still open");

        uint256 highestVotes = 0;
        bool isDraw = false;
        uint256 currentWinnerId = 0;

        for (uint256 i = 0; i < candidateIds.length; i++) {
            uint256 cId = candidateIds[i];
            uint256 votes = candidates[cId].voteCount;

            if (votes > highestVotes) {
                highestVotes = votes;
                currentWinnerId = cId;
                isDraw = false;
            } else if (votes == highestVotes && highestVotes > 0) {
                isDraw = true;
            }
        }

        if (isDraw || highestVotes == 0) {
            state = ElectionState.Draw;
        } else {
            state = ElectionState.Completed;
            winnerId = currentWinnerId;
        }

        emit ElectionResolved(state, winnerId);
    }
}
