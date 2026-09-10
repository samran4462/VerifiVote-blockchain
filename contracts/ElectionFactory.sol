// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ElectionFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    address public electionImplementation;
    address[] public deployedElections;
    mapping(uint256 => address) public electionIdToAddress;
    
    event ElectionCreated(uint256 indexed electionId, address indexed electionAddress, address creator);
    event ImplementationUpgraded(address indexed newImplementation);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _electionImplementation) public initializer {
        __Ownable_init(msg.sender);
        require(_electionImplementation != address(0), "Invalid implementation");
        electionImplementation = _electionImplementation;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Updates the master implementation contract for future elections.
     */
    function upgradeElectionImplementation(address _newImplementation) external onlyOwner {
        require(_newImplementation != address(0), "Invalid implementation");
        electionImplementation = _newImplementation;
        emit ImplementationUpgraded(_newImplementation);
    }

    /**
     * @dev Deploys a new Election proxy contract.
     * @param _electionId The unique backend ID for this election.
     * @param _backendVerifier The trusted backend address that signs 18+ age verification signatures.
     */
    function createElection(uint256 _electionId, address _backendVerifier) external {
        require(electionIdToAddress[_electionId] == address(0), "Election ID already exists");
        
        bytes memory initData = abi.encodeWithSignature(
            "initialize(uint256,address,address)",
            _electionId,
            msg.sender, // The caller becomes the admin of the Election
            _backendVerifier
        );

        // Deploy UUPS proxy pointing to the implementation and initialize it
        ERC1967Proxy proxy = new ERC1967Proxy(electionImplementation, initData);
        
        deployedElections.push(address(proxy));
        electionIdToAddress[_electionId] = address(proxy);
        
        emit ElectionCreated(_electionId, address(proxy), msg.sender);
    }

    /**
     * @dev Retrieves all deployed election proxy addresses.
     */
    function getDeployedElections() external view returns (address[] memory) {
        return deployedElections;
    }
}
