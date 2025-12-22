# 🛡️ Security FAQ

Common questions about Pribado's security architecture, encryption models, and data sovereignty.

## 🔐 Encryption & Keys

### Q: How is my data encrypted?
Pribado uses a **Double-Later Encryption** strategy:
1.  **At Rest (Database)**: All sensitive columns (audit logs, notifications) are encrypted using AES-256-GCM with a server-side `ENCLAVE_SECRET`.
2.  **User Secrets (Private Keys)**: Your actual private keys and secrets are encrypted using a key derived from **your own wallet signature**. 

### Q: What if the server is compromised and the `ENCLAVE_SECRET` is stolen?
**Your private keys remain safe.**
Even if an attacker gains full root access to the server and steals the `ENCLAVE_SECRET`:
*   They **CAN** read metadata (who performed what action, notification text).
*   They **CANNOT** decrypt your actual wallet private keys or secrets. These require your specific wallet signature to unlock, which the attacker does not have.

### Q: Is `openssl rand -hex 32` safe for generating the secret?
**Yes.** This generates a cryptographically strong 256-bit entropy secure enough for AES-256 encryption keys. It is industry standard.

```bash
ENCLAVE_SECRET=$(openssl rand -hex 32)
```

---

## 🏗️ Architecture & Infrastructure

### Q: Is this a "Real" Hardware Enclave?
**It depends on your deployment.**
*   **Standard Docker**: If you run Pribado on a standard VPS (like DigitalOcean), it uses software-based encryption. Trusted by the server admin.
*   **Oasis Sapphire**: The blockchain logic and smart contracts run on **Oasis Sapphire**, which IS a hardware-encrypted TEE (Trusted Execution Environment). Transaction data sent here is encrypted at the hardware level.

### Q: Can the server admin see my keys?
**No.** Because of the client-side signing and wallet-derived encryption, the server (and its admin) only stores opaque encrypted blobs. They cannot decrypt your keys without your active session signature.

### Q: How does Oasis Sapphire fit in?
Pribado uses the [Oasis Sapphire](https://oasisprotocol.org/sapphire) network for confidential interactions. 
*   Transactions sent to Sapphire are end-to-end encrypted.
*   Smart contract state used by Pribado is encrypted using TEEs (Intel SGX).
*   Even the node operators on the Oasis network cannot see your transaction data.

### Q: Can I store the Master Key in a TEE?
**Yes.** Instead of generating a local secret, you can deploy the `EnclaveKeyManager` smart contract on Oasis Sapphire to store your master key within the hardware enclave.
*   **Code Location**: `contracts_deploy/contracts/EnclaveKeyManager.sol`
*   **Live Example (Testnet)**: [`0xA986239da922E15d7148E0C7242040a8BcAF39f8`](https://explorer.oasis.io/testnet/sapphire/address/0xA986239da922E15d7148E0C7242040a8BcAF39f8/code#code)
This offers a higher level of security by ensuring the root of trust is established within the Sapphire TEE network.

---

## 🚨 Incident Response

### Q: What should I do if I suspect a breach?
1.  **Rotate your Wallet**: Transfer funds to a new wallet immediately.
2.  **Revoke Sessions**: Use the dashboard to revoke any active sessions.
3.  **Rotate Enclave Secret** (for Self-Hosters): Update your `.env.local` with a new `ENCLAVE_SECRET` (Note: This renders old encrypted logs unreadable unless you migrate them).

### Q: How do I report a vulnerability?
Please do **NOT** open a public issue. Email us at `security@pribado.dev` or use the contact form on our website.
