# 🔐 Pribado

**Private API Key Management & Zero-Knowledge Infrastructure**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5f5f?logo=ko-fi)](https://ko-fi.com/0xlawrence)

Pribado is a self-hostable, zero-knowledge platform for managing API keys, encrypted secrets, and private communications. Built on **Oasis Sapphire** for hardware-backed confidential computing.

![Pribado Dashboard](https://img.shields.io/badge/Status-Beta-blue)

---

## ✨ Features

### 🔑 Private API Proxy
- Store API keys (OpenAI, Anthropic, Google, etc.) encrypted
- Generate proxy keys (`priv_xxx`) to use instead of exposing real keys
- Automatic key rotation with webhook notifications
- Zero-knowledge: server stores encrypted blobs it cannot decrypt

### 🗄️ Encrypted Vault
- Password manager with AES-256-GCM encryption
- Keys derived from your wallet signature (never stored)
- Backup to Oasis Sapphire blockchain
- Cross-device sync via encrypted chain storage

### 💬 Anonymous Chat
- End-to-end encrypted real-time messaging
- No accounts, no identity tracking
- Messages exist only in transit (not stored)
- Ephemeral session keys

### 📄 Document Signing
- Sign PDFs with digital signatures
- Anchor document hashes to Sapphire blockchain
- Immutable proof of existence and integrity

### 🛡️ Security Architecture
- **Double-layer encryption**: Wallet-derived keys + server enclave
- **Hardware TEE**: Oasis Sapphire confidential smart contracts
- **Zero-knowledge**: Server cannot read your data
- **Rate limiting**: IP-based spam/abuse protection

---

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- npm v10+

### Installation

```bash
# Clone the repository
git clone https://github.com/0xrlawrence/Pribado.git
cd Pribado

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local

# Generate encryption secret
echo "ENCLAVE_SECRET=$(openssl rand -hex 32)" >> .env.local

# Build and run
npm run build
npm start
```

Open `http://localhost:3000` in your browser.

### Docker

```bash
docker-compose up -d
```

---

## 🔧 Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCLAVE_SECRET` | 64-char hex encryption key | ✅ Yes |
| `SAPPHIRE_PRIVATE_KEY` | Oasis wallet private key | ❌ Optional |
| `SAPPHIRE_RPC_URL` | Oasis RPC endpoint | ❌ Optional |

See [SELF_HOSTING.md](SELF_HOSTING.md) for complete deployment guide.

---

## 📦 CLI Tool

Manage API keys from the command line:

```bash
# Install globally
npm install -g pribado-cli

# Or use npx
npx pribado-cli

# Set up wallet
pribado init

# Add an API key
pribado keys add

# View your keys
pribado keys

# Revoke a key
pribado keys revoke
```

See [cli/README.md](cli/README.md) for full documentation.

---

## 🔐 Security

Pribado implements a **zero-knowledge architecture**:

```
User's Wallet Signature
        ↓
PBKDF2 (100,000 iterations)
        ↓
Encryption Key (exists ONLY in browser memory)
        ↓
AES-256-GCM Encryption
        ↓
Encrypted blob sent to server
```

**Result:** Server stores encrypted data it CANNOT decrypt.

For detailed security documentation, see [SECURITY.md](SECURITY.md).

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, TailwindCSS |
| Encryption | AES-256-GCM, PBKDF2, Argon2id |
| Blockchain | Oasis Sapphire (TEE) |
| Database | SQLite (WAL mode) |
| Transport | HTTPS/TLS 1.3 |
| Real-time | Socket.IO |

---

## 📚 Documentation

- [Self-Hosting Guide](SELF_HOSTING.md)
- [Security Architecture](SECURITY.md)
- [Security FAQ](SECURITY_FAQ.md)
- [Contributing](CONTRIBUTING.md)
- [CLI Documentation](cli/README.md)

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 💰 Support

If you find this project useful, consider supporting its development:

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/0xlawrence)

**Mainnet access** requires a minimal $1/month fee to prevent spam and support infrastructure.

---

## ⚠️ Disclaimer

This project is provided as-is for personal and educational use. Not designed for enterprise scaling. If you choose to use this in a production environment, you do so at your own risk.

For enterprise use, you are encouraged to **self-host** and create your own infrastructure.

---

## 📄 License

[MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ❤️ for privacy</sub>
</p>
