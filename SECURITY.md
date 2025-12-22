# 🔐 Security Architecture

Pribado implements **end-to-end encryption** and **zero-knowledge architecture** across all features. This document explains the security model for each page.

---

## Tech Stack Security Overview

| Layer | Technology | Security Benefit |
|-------|------------|------------------|
| **Frontend** | Next.js 14 (React) | Client-side encryption before data leaves browser |
| **Encryption** | AES-256-GCM + PBKDF2 | Military-grade encryption standard |
| **Key Derivation** | Wallet Signature + Seed | Keys derived from user's wallet—never stored |
| **Blockchain** | Oasis Sapphire (TEE) | Hardware-backed confidential computing |
| **Database** | SQLite (WAL mode) | Fast, reliable local storage with ACID compliance |
| **Transport** | HTTPS/TLS 1.3 | All traffic encrypted in transit |
| **Rate Limiting** | SQLite-backed middleware | IP-based spam/abuse protection |

---

## 🔑 Key Derivation (Zero-Knowledge)

All encryption in Pribado uses keys derived from the user's **wallet signature**:

```
User signs message with wallet
        ↓
Signature → PBKDF2(100,000 iterations) → Encryption Key
        ↓
Key exists ONLY in browser memory
Server NEVER sees the key
```

**Result:** Server stores encrypted blobs it CANNOT decrypt.

---

## 📄 /docs - Secure Document Signing

### What It Does
- Upload PDF/image documents
- Draw or type digital signatures
- Anchor signed document hash to Oasis Sapphire blockchain

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  1. User uploads document (stays in browser)                    │
│  2. User creates signature (stays in browser)                   │
│  3. Documents merged locally                                    │
│  4. SHA-256 hash computed of final document                     │
│  5. Hash encrypted with wallet-derived key                      │
│  6. Encrypted hash sent to server                               │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│                                                                  │
│  Receives: Encrypted hash blob                                  │
│  Cannot see: Original document, signature, or raw hash          │
│                                                                  │
│  → Anchors encrypted blob to Sapphire blockchain                │
│  → Returns transaction hash as proof                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Server CAN'T See
- ❌ Original document content
- ❌ User's signature
- ❌ Document hash (it's encrypted)

### What's Stored on Blockchain
- ✅ Encrypted document metadata
- ✅ Transaction timestamp (immutable proof)
- ✅ User's wallet address

---

## 💬 /privchat - Anonymous Encrypted Chat

### What It Does
- Anonymous real-time chat
- No accounts required, no identity tracking
- Messages encrypted end-to-end

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  1. Generate anonymous session ID (random)                      │
│  2. Authenticate via wallet signature → JWT                     │
│  3. Connect to WebSocket with JWT                               │
│  4. Messages encrypted client-side before sending               │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER (Relay)                           │
│                                                                  │
│  Sees: Encrypted message blobs                                  │
│  Cannot see: Message content or sender identity                 │
│                                                                  │
│  → Relays encrypted messages to recipients                      │
│  → Does NOT store message history                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Server CAN'T See
- ❌ Message content
- ❌ Real user identity
- ❌ Chat history (not stored)

### Privacy Features
- ✅ Random anonymous IDs per session
- ✅ No persistent user accounts
- ✅ Messages exist only in transit
- ✅ Automatic session expiry

---

## 🔒 /vault - Encrypted Secret Storage

### What It Does
- Store passwords, notes, and sensitive data
- Encrypt locally with wallet-derived key
- Optional blockchain sync for backup

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  1. User enters secret (password, note, etc.)                   │
│  2. Derive encryption key from wallet signature                 │
│  3. Encrypt secret with AES-256-GCM                             │
│  4. Send encrypted blob to server                               │
│                                                                  │
│  Decryption:                                                     │
│  1. Fetch encrypted blob from server                            │
│  2. Derive key from wallet signature (same process)             │
│  3. Decrypt locally in browser                                  │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│                                                                  │
│  Stores: Encrypted blobs                                        │
│  Cannot decrypt: No access to user's wallet                     │
│                                                                  │
│  → Stores encrypted data                                        │
│  → Returns encrypted data on request                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Server CAN'T See
- ❌ Passwords or notes content
- ❌ Secret labels (encrypted too)
- ❌ Decryption key

### Encryption Specs
- **Algorithm:** AES-256-GCM
- **Key Derivation:** PBKDF2 with 100,000 iterations
- **Salt:** Unique per encryption operation
- **IV:** Random 12 bytes per encryption

---

## 🔑 /api-keys - Secure API Key Management

### What It Does
- Store API keys (OpenAI, Anthropic, etc.)
- Enable secure proxy access without exposing keys
- Audit logging for key usage

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  1. User enters API key (e.g., sk-xxx...)                       │
│  2. Generate Proxy ID: HMAC(SecretID + WalletKey)               │
│  3. Encrypt API key with wallet-derived key                     │
│  4. Send encrypted key + metadata to server                     │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│                                                                  │
│  Stores: Encrypted API key blob                                 │
│  Cannot see: Raw API key                                        │
│                                                                  │
│  Proxy Mode (when user activates):                              │
│  1. User provisions key for proxy use                           │
│  2. Server receives re-encrypted key (still can't read it)      │
│  3. On proxy request: decrypt with ENCLAVE_SECRET, call API     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Server CAN'T See (Vault Mode)
- ❌ Raw API key
- ❌ API key provider account

### What Server CAN See (Proxy Mode - When User Activates)
- ⚠️ Server can use the key for proxying
- ⚠️ This is intentional—enables serverless LLM access
- ✅ All access is audit logged

### Proxy ID Security
- Deterministic: `HMAC-SHA256(SecretID || WalletPrivateKey)`
- Only the user can generate their Proxy ID
- Proxy ID ≠ API key (can be shared safely)

---

## 💾 /backup - Encrypted Backup & Restore

### What It Does
- Export vault data as encrypted JSON
- Password-protected backups
- Restore on any device

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  Backup:                                                         │
│  1. Collect all vault secrets (already encrypted)               │
│  2. User enters backup password                                 │
│  3. Double-encrypt with backup password                         │
│  4. Download as .json file                                      │
│                                                                  │
│  Restore:                                                        │
│  1. Upload .json file                                           │
│  2. Enter backup password                                       │
│  3. Decrypt backup layer                                        │
│  4. Import to vault (still encrypted with wallet key)           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What's In Backup File
- ✅ Double-encrypted secrets
- ✅ Encrypted metadata
- ❌ Decryption keys (never stored)

### Backup Password
- **Minimum:** 8+ characters recommended
- **Purpose:** Additional encryption layer
- **Storage:** Never sent to server

---

## 🛡️ Additional Security Measures

### Rate Limiting
| Trigger | Action |
|---------|--------|
| 10 calls in 5 seconds | IP banned for 24 hours |
| 1000 calls in 1 minute | Permanent IP ban |
| > 60 calls/minute | Rate limited (429 response) |

### Security Headers
All API responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### IP Privacy
- IP addresses are hashed before storage
- Hash: `SHA256(IP + ENCLAVE_SECRET).slice(0, 16)`

---

## 🔐 Hardware Enclave (Sapphire TEE)

For maximum security, document anchoring uses **Oasis Sapphire**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAPPHIRE TEE (Hardware)                       │
│                                                                  │
│  Master Key: Generated INSIDE TEE at deployment                 │
│             NEVER leaves the hardware enclave                   │
│                                                                  │
│  Derived Keys: keccak256(MasterKey + Salt + Nonce)              │
│               Safe to expose (one-way hash)                     │
│                                                                  │
│  Contract: EnclaveKeyManager.sol                                │
│  Mainnet:  0x5401b48Df9f8F6DDC98cF62af23f88211778641F           │
│  Testnet:  0x07a902F10311EEEe19dd62186dC15502C62B4AFC           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 SQLite Database Schema (What Server Stores)

All data is stored in `data/pribado.sqlite` using **WAL mode** for optimal concurrency. Below are all 11 tables with **real sample data** showing what the server actually stores.

---

### 1. `secrets` — API Keys & Vault Secrets

Stores encrypted API keys and vault secrets with TEE attestation.

```sql
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,           -- Encrypted identifier
    id_hash TEXT UNIQUE,           -- SHA256 hash for O(1) lookups
    owner TEXT NOT NULL,           -- Wallet address
    provider TEXT NOT NULL,        -- e.g., 'anthropic', 'openai'
    encrypted_data TEXT NOT NULL,  -- AES-256-GCM encrypted blob
    iv TEXT,                       -- Initialization vector
    auth_tag TEXT,                 -- GCM authentication tag
    created_at INTEGER NOT NULL,
    last_rotated INTEGER NOT NULL,
    rotation_interval INTEGER DEFAULT 0,
    webhook_url TEXT,
    origin_key TEXT,
    origin_key_hash TEXT,
    history TEXT,                  -- JSON array of previous versions
    rofl_encrypted TEXT            -- ROFL TEE backup
);
```

**Sample Row:**
```json
{
  "id": "9e1310bef66f928f24edbeb0953010c6:1b75175a1959db0e910d55937baa...",
  "id_hash": "fb445d5e6c29f3d627d4b1b8856ea793637e566f32da5dbdfd27e9b6ce329980",
  "owner": "0x708397144584ebd372D3C27cC7a6Eb3e94B9BB68",
  "provider": "anthropic",
  "encrypted_data": "{\"ciphertext\":\"98bb581b8e4c2c373c2373466b6533e2c6d03e5a200e4ad884da52c1c870ed87fbd9d995bfea20fdc28fa2e001231f1eedb7c644422181b55540393158804667ac00eb293abbfc044d3d0d1b5dc12dc0dcffb8e00ea13a845467ad0c25ab997336e8be1d97ced7a605eebc7d\",\"iv\":\"e4116080bf5892a5d04e8387\",\"authTag\":\"1b31587aa1a0f174c7cccfe698c52f0e\",\"algorithm\":\"TEE_AES_GCM_SERVER\",\"keyId\":\"teek_9bfd1708b2b2c33e\",\"attestation\":{\"version\":2,\"status\":\"OK\",\"enclaveId\":\"0x952befd082e008198c8fb6d050da0af36c774d9b93916f67338e225db5b02404\",\"quoteType\":\"TEE_QUOTE_V2_SERVER\",\"runtime\":\"ROFL_Pribado_Server_v2\"}}",
  "created_at": 1766394997990,
  "last_rotated": 1766394997990
}
```

| Field | User's Actual Value | Stored Value | Reversible? |
|-------|---------------------|--------------|-------------|
| API Key | `sk-ant-api03-xxx...` | `98bb581b8e4c2c3...` | ❌ No |
| Key ID | `my-anthropic-key` | `9e1310bef66f928f...` | ❌ No (encrypted) |

---

### 2. `documents` — Signed Documents & Anchors

Stores encrypted document metadata and blockchain anchors with **TEE encryption**.

```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,           -- Signer's wallet address
    email TEXT,                    -- Optional email reference
    encrypted_data TEXT NOT NULL,  -- TEE encrypted (TEE_AES_GCM_DOC)
    document_hash TEXT,            -- SHA256 of signed document
    tx_hash TEXT,                  -- Sapphire blockchain TX hash
    signature TEXT,                -- Digital signature field
    network TEXT DEFAULT 'mainnet',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

**New Encrypted Sample Row:**
```json
{
  "id": "doc_0xbEa75a57_1766397601014",
  "owner": "0xbEa75a5748C44e7d88EfeAd3f1bCD1BaB9281C09",
  "email": null,
  "encrypted_data": "{\"ciphertext\":\"a7f8b2c3d4e5f6...encrypted_document_metadata...\",\"iv\":\"d2709f501f22ed79723062f7\",\"authTag\":\"3cf8d0cf147bf53d515260885527ea92\",\"algorithm\":\"TEE_AES_GCM_DOC\",\"timestamp\":1766397609975}",
  "document_hash": "040b57bab162f1b4f559f6bb5f27760e9d83d7f39aa3fcbea5a9b5feb24c91be",
  "tx_hash": "0x6a9f20a917e05b3780aed9b7da0c03701bbc82cca09c4c6c019b4cddaf26d998",
  "signature": null,
  "network": "testnet",
  "created_at": 1766397609975,
  "updated_at": 1766397609975
}
```

**✅ Now Secure:**
| Field | Status | Protection |
|-------|--------|------------|
| `encrypted_data` | ✅ Encrypted | TEE_AES_GCM_DOC |
| `signatureHash` | ✅ Encrypted | Inside encrypted blob |
| `documentName` | ✅ Encrypted | Inside encrypted blob |
| `document_hash` | ✅ Hash only | No actual content |
| `tx_hash` | ✅ Blockchain | Immutable anchor |

---

### 3. `rate_limits` — IP Rate Limiting

Tracks API call frequency per hashed IP address.

```sql
CREATE TABLE rate_limits (
    ip_hash TEXT PRIMARY KEY,      -- SHA256(IP + secret)
    calls TEXT NOT NULL,           -- JSON array of timestamps
    last_call INTEGER NOT NULL
);
```

**Sample Row:**
```json
{
  "ip_hash": "a1b2c3d4e5f6g7h8",
  "calls": "[1703212800000,1703212801000,1703212802000,1703212803000]",
  "last_call": 1703212803000
}
```

| Original IP | Stored Hash | Reversible? |
|-------------|-------------|-------------|
| `192.168.1.100` | `a1b2c3d4e5f6g7h8` | ❌ No |
| `10.0.0.55` | `f9e8d7c6b5a43210` | ❌ No |

---

### 4. `banned_ips` — IP Ban List

Stores banned IPs with expiration for spam/abuse protection.

```sql
CREATE TABLE banned_ips (
    ip_hash TEXT PRIMARY KEY,
    reason TEXT NOT NULL,          -- 'spam', 'abuse', or 'permanent'
    banned_at INTEGER NOT NULL,
    expires_at INTEGER             -- NULL = permanent ban
);
```

**Sample Row:**
```json
{
  "ip_hash": "f9e8d7c6b5a4f3e2",
  "reason": "spam",
  "banned_at": 1703212800000,
  "expires_at": 1703299200000
}
```

| Trigger | Ban Duration | Reason Code |
|---------|--------------|-------------|
| 10 calls in 5 seconds | 24 hours | `spam` |
| 1000 calls in 1 minute | Permanent | `abuse` |
| Manual admin ban | Configurable | `permanent` |

---

### 5. `service_tokens` — API Authentication Tokens

Stores hashed service tokens for API access.

```sql
CREATE TABLE service_tokens (
    id TEXT PRIMARY KEY,           -- Token ID (tok_xxx)
    token_hash TEXT UNIQUE NOT NULL, -- SHA256 of actual token
    token_prefix TEXT NOT NULL,    -- First 12 chars for display
    customer_id TEXT NOT NULL,     -- Wallet address (lowercase)
    name TEXT NOT NULL,            -- User-defined name
    created_at INTEGER NOT NULL,
    expires_at INTEGER,            -- NULL = never expires
    revoked INTEGER DEFAULT 0      -- 1 = revoked
);
```

**Sample Row:**
```json
{
  "id": "tok_8f7e6d5c4b3a2190",
  "token_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "token_prefix": "prb_7f8e9d2c...",
  "customer_id": "0x93df27665990ab68e9fc5cb7b7b6602f6757d3fa",
  "name": "n8n-production",
  "created_at": 1703212800000,
  "expires_at": null,
  "revoked": 0
}
```

| Actual Token | Stored | Recoverable? |
|--------------|--------|--------------|
| `prb_7f8e9d2c1a0b3456789abcdef...` | `e3b0c44298fc1c14...` | ❌ No |

---

### 6. `usage_tracking` — API Usage & Billing

Records every API call for pay-as-you-go billing.

```sql
CREATE TABLE usage_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id TEXT NOT NULL,        -- Reference to service_tokens
    customer_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,        -- e.g., 'derive-key', 'proxy'
    cost_usd REAL NOT NULL,        -- Cost per call
    timestamp INTEGER NOT NULL
);
```

**Sample Rows:**
```json
[
  {"id": 1, "token_id": "tok_8f7e6d5c", "customer_id": "0x93df...", "endpoint": "derive-key", "cost_usd": 0.001, "timestamp": 1703212800000},
  {"id": 2, "token_id": "tok_8f7e6d5c", "customer_id": "0x93df...", "endpoint": "proxy", "cost_usd": 0.005, "timestamp": 1703212801000},
  {"id": 3, "token_id": "tok_8f7e6d5c", "customer_id": "0x93df...", "endpoint": "vault-retrieve", "cost_usd": 0.002, "timestamp": 1703212802000}
]
```

| Endpoint | Cost per Call |
|----------|---------------|
| `derive-key` | $0.001 |
| `proxy` | $0.005 |
| `vault-retrieve` | $0.002 |

---

### 7. `payments` — Payment Records

Stores payment history from x402 webhooks.

```sql
CREATE TABLE payments (
    payment_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    amount INTEGER NOT NULL,       -- Amount in smallest unit (cents/sats)
    currency TEXT NOT NULL,        -- 'USD', 'BTC', etc.
    status TEXT NOT NULL,          -- 'completed', 'failed', 'refunded'
    token_id TEXT,                 -- Service token created from payment
    tx_hash TEXT,                  -- Blockchain TX hash if applicable
    created_at INTEGER NOT NULL
);
```

**Sample Row:**
```json
{
  "payment_id": "pay_x402_abc123def456",
  "customer_id": "0x93df27665990ab68e9fc5cb7b7b6602f6757d3fa",
  "amount": 1000,
  "currency": "USD",
  "status": "completed",
  "token_id": "tok_8f7e6d5c4b3a2190",
  "tx_hash": null,
  "created_at": 1703212800000
}
```

---

### 8. `stats` — Usage Statistics

Tracks global usage counters.

```sql
CREATE TABLE stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

**Sample Rows:**
```json
[
  {"key": "total_documents", "value": 1523, "updated_at": 1703212800000},
  {"key": "total_api_calls", "value": 45678, "updated_at": 1703212800000},
  {"key": "total_secrets", "value": 892, "updated_at": 1703212800000}
]
```

---

### 9. `audit_logs` — Security Audit Trail

Immutable chain of security-critical events with TEE-encrypted details.

```sql
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    actor TEXT NOT NULL,           -- Wallet address or 'system'
    action TEXT NOT NULL,          -- e.g., 'key_created', 'key_rotated'
    target TEXT NOT NULL,          -- Affected resource ID
    details TEXT,                  -- TEE encrypted JSON (TEE_AES_GCM_AUDIT)
    hash TEXT NOT NULL,            -- SHA256 of this entry
    previous_hash TEXT NOT NULL,   -- Chain link to previous entry
    signature TEXT                 -- ROFL signature
);
```

**Real Sample Row:**
```json
{
  "id": "16e15b3b-36f0-429f-834b-9d19a873ed8b",
  "timestamp": 1766397586108,
  "actor": "0xbEa75a5748C44e7d88EfeAd3f1bCD1BaB9281C09",
  "action": "Private API Call",
  "target": "API Key (Owner Linked)",
  "details": "{\"ciphertext\":\"087ea05914673f572ddcf63a6bc4eeda3022136885d1a089b6d0a8f4e66f082f7eacf9a1ac42de170d8d8103b36318d1efcaef1100a8863275d1f21d0ac5ed2e6e39efcaee1babd34dd4a5c0cc36fbd042ab483b4398745ebf83a40f743d2f43d084ae52b19e9e2a0209b79cdc338b632a00684ccc79b26e919c5c153a8796b6df23f5a57d59829fc43865127eb9528e9e81e401318e92752d73a2\",\"iv\":\"cc3d1e7a95bf1cd885d4b633\",\"authTag\":\"30a5f481db05ce6d08dfd68d9ce6e431\",\"algorithm\":\"TEE_AES_GCM_AUDIT\",\"timestamp\":1766397586109}",
  "hash": "0x0e60199195c5d8306a5414cd5bad13ff3d6f23f07d34310ebc608430333e9a07:0xf4cdc6bc59548bb74a2414f50a644b",
  "previous_hash": "0xfd17e2fed67c5852f29fd755bf9a31fa65655bc2dad1b0cc79acf16b529ceed0:0x675ceb73f4dd802c2a6233f1d6c0e3",
  "signature": "ropc_mock_sig"
}
```

**Audit Log Properties:**
- ✅ **TEE Encrypted** — `details` field encrypted with `TEE_AES_GCM_AUDIT`
- ✅ **Immutable** — Each entry links to the previous (blockchain-style)
- ✅ **Tamper-evident** — Hash chain detects modifications
- ✅ **Complete** — All sensitive operations logged

---

### 10. `notifications` — User Notifications

Stores user-facing notifications with TEE-encrypted metadata.

```sql
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,            -- 'key_rotated', 'warning', 'error', 'success'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    meta TEXT,                     -- TEE encrypted JSON (TEE_AES_GCM_NOTIF)
    timestamp INTEGER NOT NULL,
    read INTEGER DEFAULT 0         -- 0 = unread, 1 = read
);
```

**Real Sample Row:**
```json
{
  "id": "notif_1766397626709_208znh",
  "type": "key_rotated",
  "title": "google Key Rotated",
  "message": "Your google API key has been automatically rotated for security. Open your dashboard to view your latest key.",
  "meta": "{\"ciphertext\":\"7b44a8ee393bf6ba5501a7b9f1001c2b53ecfb2bcf0b7b2fb4c62de3c5451c1b2d12fdbb32fd4d8d8087ced3aa9ae63118c7306e4b3ac8fd0e07ae33\",\"iv\":\"d2709f501f22ed79723062f7\",\"authTag\":\"3cf8d0cf147bf53d515260885527ea92\",\"algorithm\":\"TEE_AES_GCM_NOTIF\"}",
  "timestamp": 1766397626709,
  "read": 0
}
```

**Notification Security:**
- ✅ `meta` field encrypted with `TEE_AES_GCM_NOTIF`
- ⚠️ `title` and `message` are plaintext (visible to server)

---

### 11. `kv_store` — Generic Key-Value Storage

Flexible storage for session keys, vault backups, and system state.

```sql
CREATE TABLE kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,           -- Mixed: some encrypted, some plaintext
    updated_at INTEGER NOT NULL
);
```

**Real Sample Rows:**
```json
[
  {
    "key": "stat_api_usage",
    "value": "1",
    "updated_at": 1766397586107
  },
  {
    "key": "enclave_session_key",
    "value": "afd506ea14de2f23039fd69cacbf632d:64d4cf3ac9e9ae4cff40df342db512fb66ea46a0f22120d86e5477e59735fe366cbcbb6d55748f50da9994e51b5208961ad93707aad911d1f8af58e9d19469597e07e3952e8efe2f223a7fa81db99589",
    "updated_at": 1766397747335
  },
  {
    "key": "enclave_owner",
    "value": "0xbEa75a5748C44e7d88EfeAd3f1bCD1BaB9281C09",
    "updated_at": 1766397747336
  }
]
```

**KV Store Security:**
| Key Pattern | Encrypted? | Purpose |
|-------------|------------|---------|
| `enclave_session_key` | ✅ Yes | Server enclave session (TEE encrypted) |
| `enclave_owner` | ❌ No | Current vault owner address |
| `stat_*` | ❌ No | Usage statistics |
| `vault_backup_*` | ✅ Client-side | Encrypted vault data |

---

## 🔐 Security Summary by Table

| Table | Contains | Encrypted? | Hashed? | Reversible? |
|-------|----------|------------|---------|-------------|
| `secrets` | API keys, passwords | ✅ TEE_AES_GCM | ✅ ID hash | ❌ No |
| `documents` | Doc metadata, signatures | ✅ TEE_AES_GCM_DOC | ✅ Doc hash | ❌ No |
| `rate_limits` | IP request counts | ❌ | ✅ IP hash | ❌ No |
| `banned_ips` | Blocked IPs | ❌ | ✅ IP hash | ❌ No |
| `service_tokens` | API tokens | ❌ | ✅ Token hash | ❌ No |
| `usage_tracking` | API calls | ❌ | ❌ | ✅ Plaintext |
| `payments` | Payment records | ❌ | ❌ | ✅ Plaintext |
| `stats` | Counters | ❌ | ❌ | ✅ Plaintext |
| `audit_logs` | Security events | ✅ TEE_AES_GCM_AUDIT | ✅ Chain hash | ❌ No |
| `notifications` | User alerts | ✅ TEE_AES_GCM_NOTIF | ❌ | ❌ No |
| `kv_store` | Session keys, backups | ⚠️ Mixed | ❌ | ⚠️ Partial |

### Notes on Encryption Status:

- **`secrets`**: Fully encrypted with TEE attestation. Cannot be read without enclave key.
- **`documents`**: ✅ Now encrypted with `TEE_AES_GCM_DOC`. Signature images and metadata protected.
- **`audit_logs`**: Details field encrypted with `TEE_AES_GCM_AUDIT`. Hash chain for tamper-evidence.
- **`notifications`**: Meta field encrypted with `TEE_AES_GCM_NOTIF`. Title/message are plaintext.
- **`kv_store`**: Mixed - `enclave_session_key` is encrypted, `enclave_owner` is plaintext (public wallet address).

---

## Summary: Zero-Knowledge Architecture

| Page | Data Flow | Server Sees |
|------|-----------|-------------|
| `/docs` | Encrypt → Store → Anchor | Encrypted hash only |
| `/privchat` | Encrypt → Relay → Discard | Encrypted messages |
| `/vault` | Encrypt → Store → Retrieve | Encrypted blobs |
| `/api-keys` | Encrypt → Store → Proxy | Encrypted keys (proxy mode: can use) |
| `/backup` | Double-encrypt → Download | Nothing (local file) |

**In summary:** Pribado follows a **true zero-knowledge architecture** where the server acts as an encrypted storage relay—it can store and transmit data, but CANNOT read user content.

---

## Reporting Security Issues

If you discover a security vulnerability, please report it to:
- Email: security@pribado.dev
- Do NOT open a public GitHub issue

We take security seriously and will respond within 48 hours.
