// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EnclaveKeyManager
 * @dev Manages the Master Encryption Key for Pribado Enclaves.
 * Deployed on Oasis Sapphire (TEE) to ensure state confidentiality.
 * 
 * SECURITY FEATURES:
 * - Key is generated ON-CHAIN using Sapphire's secure random (never in calldata)
 * - All sensitive operations require owner authentication
 * - Key rotation generates new random key inside TEE
 * - External callers can derive child keys without seeing the master
 */
contract EnclaveKeyManager {
    // The Master Encryption Key (Generated and stored in TEE)
    bytes32 private masterKey;
    
    // Key derivation nonce (for generating unique child keys)
    uint256 private keyNonce;
    
    // The authorized server wallet capable of retrieving the key
    address public owner;

    event KeyRotated(address indexed by, uint256 timestamp, uint256 newNonce);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    /**
     * @dev Constructor generates a random master key inside the TEE.
     * No key is passed in - it's created securely on-chain.
     */
    constructor() {
        owner = msg.sender;
        // Generate master key using Sapphire's secure random (inside TEE)
        masterKey = bytes32(Sapphire.randomBytes(32, abi.encodePacked(block.timestamp, msg.sender)));
        keyNonce = 1;
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
     * @dev Derives a child key from the master key.
     * Useful for generating unique encryption keys per user/purpose.
     * NOTE: This is PUBLIC because it only returns a derived hash, not the master key.
     * An attacker cannot reverse-engineer the master key from derived keys.
     * @param salt A unique salt for this derivation (e.g., user address, purpose ID)
     * @return The derived child key
     */
    function deriveKey(bytes32 salt) external view returns (bytes32) {
        return keccak256(abi.encodePacked(masterKey, salt, keyNonce));
    }

    /**
     * @dev Rotates the master key using TEE-generated randomness.
     * Use this if the previous key is suspected to be compromised.
     * NO KEY IS PASSED IN - a new random key is generated securely.
     */
    function rotateKey() external onlyOwner {
        // Generate new random key inside TEE
        masterKey = bytes32(Sapphire.randomBytes(32, abi.encodePacked(
            block.timestamp,
            msg.sender,
            keyNonce,
            blockhash(block.number - 1)
        )));
        keyNonce++;
        emit KeyRotated(msg.sender, block.timestamp, keyNonce);
    }

    /**
     * @dev Injects a specific key (for migration from external secret).
     * WARNING: Only use this via ENCRYPTED Sapphire transaction!
     * Prefer rotateKey() for normal operations.
     * @param _newKey The 32-byte key to inject
     */
    function injectKey(bytes32 _newKey) external onlyOwner {
        masterKey = _newKey;
        keyNonce++;
        emit KeyRotated(msg.sender, block.timestamp, keyNonce);
    }

    /**
     * @dev Get current key nonce (useful for tracking rotations)
     */
    function getKeyNonce() external view returns (uint256) {
        return keyNonce;
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

    /**
     * @dev Generates a one-time encrypted response using Sapphire's encryption.
     * This can be used to securely transmit the key to a specific recipient.
     * @param recipientPublicKey The X25519 public key of the recipient
     * @return nonce The encryption nonce
     * @return ciphertext The encrypted master key
     */
    function getEncryptedSecret(bytes32 recipientPublicKey) external view onlyOwner returns (bytes32 nonce, bytes memory ciphertext) {
        // Generate random nonce
        nonce = bytes32(Sapphire.randomBytes(32, abi.encodePacked(block.timestamp, msg.sender)));
        
        // Encrypt the master key using Sapphire's X25519-DeoxysII
        ciphertext = Sapphire.encrypt(
            recipientPublicKey,
            nonce,
            abi.encodePacked(masterKey),
            "" // No additional data
        );
    }
}
