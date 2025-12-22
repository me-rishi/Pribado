/**
 * Crypto utilities for Pribado CLI
 * AES-256-GCM encryption with PBKDF2 key derivation
 */
interface EncryptedData {
    iv: string;
    salt: string;
    data: string;
    tag: string;
}
/**
 * Encrypt plaintext with password
 */
export declare function encrypt(plaintext: string, password: string): EncryptedData;
/**
 * Decrypt ciphertext with password
 */
export declare function decrypt(encryptedData: EncryptedData, password: string): string;
/**
 * Encrypt object to JSON string
 */
export declare function encryptObject(obj: object, password: string): string;
/**
 * Decrypt JSON string to object
 */
export declare function decryptObject<T>(encryptedJson: string, password: string): T;
export {};
//# sourceMappingURL=crypto.d.ts.map