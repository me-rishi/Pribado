"use strict";
/**
 * Crypto utilities for Pribado CLI
 * AES-256-GCM encryption with PBKDF2 key derivation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.encryptObject = encryptObject;
exports.decryptObject = decryptObject;
const crypto = __importStar(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}
/**
 * Encrypt plaintext with password
 */
function encrypt(plaintext, password) {
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
function decrypt(encryptedData, password) {
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
function encryptObject(obj, password) {
    const plaintext = JSON.stringify(obj);
    return JSON.stringify(encrypt(plaintext, password));
}
/**
 * Decrypt JSON string to object
 */
function decryptObject(encryptedJson, password) {
    const encryptedData = JSON.parse(encryptedJson);
    const decrypted = decrypt(encryptedData, password);
    return JSON.parse(decrypted);
}
//# sourceMappingURL=crypto.js.map