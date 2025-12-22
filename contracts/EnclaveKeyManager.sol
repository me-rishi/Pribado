// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title EnclaveKeyManager
 * @dev Manages the Master Encryption Key for Pribado Enclaves.
 * Deployed on Oasis Sapphire (TEE) to ensure state confidentiality.
 */
contract EnclaveKeyManager {
    // The Master Encryption Key (Encrypted in TEE state)
    bytes32 private masterKey;
    
    // The authorized server wallet capable of retrieving the key
    address public owner;

    event KeyRotated(address indexed by, uint256 timestamp);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    /**
     * @dev Constructor sets the initial master key and owner.
     * @param _initialKey The 32-byte master key (Must be sent via encrypted transaction!)
     */
    constructor(bytes32 _initialKey) {
        owner = msg.sender;
        masterKey = _initialKey;
    }

    /**
     * @dev Access Control Modifier
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "EnclaveKeyManager: Unauthorized");
        _;
    }

    /**
     * @dev Retrieves the Master Key.
     * MUST be called via a signed, encrypted View call (sapphire.wrap).
     * The return value is encrypted with the caller's public key (end-to-end encryption).
     */
    function getSecret() external view onlyOwner returns (bytes32) {
        return masterKey;
    }

    /**
     * @dev Rotates the master key.
     * Use this if the previous key is suspected to be compromised.
     * @param _newKey The new 32-byte master key.
     */
    function rotateKey(bytes32 _newKey) external onlyOwner {
        masterKey = _newKey;
        emit KeyRotated(msg.sender, block.timestamp);
    }

    /**
     * @dev Transfers ownership to a new server wallet.
     * Use this if the server's wallet private key is compromised.
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        emit OwnerUpdated(owner, _newOwner);
        owner = _newOwner;
    }
}
