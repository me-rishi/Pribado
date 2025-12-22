/**
 * Crypto utilities for Pribado CLI
 * AES-256-GCM encryption with PBKDF2 key derivation
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;

interface EncryptedData {
    iv: string;      // base64
    salt: string;    // base64
    data: string;    // base64
    tag: string;     // base64
}

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt plaintext with password
 */
export function encrypt(plaintext: string, password: string): EncryptedData {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        data: encrypted.toString('base64'),
        tag: tag.toString('base64'),
    };
}

/**
 * Decrypt ciphertext with password
 */
export function decrypt(encryptedData: EncryptedData, password: string): string {
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const data = Buffer.from(encryptedData.data, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');

    const key = deriveKey(password, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}

/**
 * Encrypt object to JSON string
 */
export function encryptObject(obj: object, password: string): string {
    const plaintext = JSON.stringify(obj);
    return JSON.stringify(encrypt(plaintext, password));
}

/**
 * Decrypt JSON string to object
 */
export function decryptObject<T>(encryptedJson: string, password: string): T {
    const encryptedData: EncryptedData = JSON.parse(encryptedJson);
    const decrypted = decrypt(encryptedData, password);
    return JSON.parse(decrypted);
}
