# Pribado CLI

Command-line interface for Pribado Private API key management.

## Installation

```bash
# Install globally
npm install -g pribado-cli

# Or run directly with npx
npx pribado-cli
```

## Quick Start

```bash
# 1. Set up your wallet
pribado init

# 2. Add an API key
pribado keys add

# 3. View your API keys
pribado keys

# 4. Revoke a key
pribado keys revoke

# 5. Revoke ALL keys
pribado keys revoke all

# 6. View your wallet info
pribado whoami

# 7. Clear local configuration
pribado logout
```

## Commands

### Core
| Command | Description |
|---------|-------------|
| `pribado init` | Create a new wallet or import existing seed phrase |
| `pribado whoami` | Show current wallet information |
| `pribado logout` | Clear local configuration |

### Key Management
| Command | Description |
|---------|-------------|
| `pribado keys` | List all your API keys and their Pribado Private API Proxies |
| `pribado keys add` | Add and provision a new API key |
| `pribado keys revoke [id]` | Revoke a specific API key (by ID or Pribado ID) |
| `pribado keys revoke all` | Revoke ALL API keys instantly |

## Security

- Your seed phrase is encrypted with AES-256-GCM
- Password uses PBKDF2 with 100,000 iterations
- Configuration stored at `~/.pribado/config.json`
- File permissions set to owner-only (600)

## How It Works

1. **Wallet Derivation**: Uses the same BIP-39/BIP-44 derivation path as the web app
2. **Same Identity**: Your CLI wallet address matches your web dashboard
3. **Proxy Keys**: Generate deterministic Pribado IDs for your API keys

## Usage with Pribado Proxy

After adding keys using `pribado keys add`, use your Pribado Private API Proxy key:

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: 'priv_abc123...',  // Your Pribado key proxy
    baseURL: 'https://pribado.dev/api/proxy/openai'
});

// Use normally
const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Provider-Specific Examples (CURL)

#### Anthropic
```bash
curl -X POST "https://pribado.dev/api/proxy/anthropic/messages" \
  -H "Content-Type: application/json" \
  -H "x-api-key: priv_..." \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model": "claude-3-haiku-20240307", "max_tokens": 50, "messages": [{"role": "user", "content": "Hello, world!"}]}'
```

#### OpenRouter
```bash
curl -s https://pribado.dev/api/proxy/openrouter/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: priv_..." \
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello, world!"}]
  }'
```

#### Google
```bash
curl -X POST https://pribado.dev/api/proxy/google/models/gemini-2.5-flash:generateContent \
  -H "Authorization: Bearer priv_..." \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello, world!"}]
    }]
  }'
```

#### DeepSeek
```bash
curl -X POST https://pribado.dev/api/proxy/deepseek/chat/completions \
  -H "Authorization: Bearer priv_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello, world!"}]
  }'
```

#### OpenAI
```bash
curl -X POST https://pribado.dev/api/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer priv_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, world!"}]
  }'
```

#### Groq
```bash
curl -X POST https://pribado.dev/api/proxy/groq/v1/chat/completions \
  -H "Authorization: Bearer priv_..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello, world!"}]
  }'
```

#### Supabase
```bash
curl -X GET "https://pribado.dev/api/proxy/supabase/rest/v1/your_table_name?select=*" \
  -H "Authorization: Bearer priv_..." \
  -H "x-supabase-url: https://your-project.supabase.co"
```

## Encryption & Security Architecture

Pribado employs a **Zero-Knowledge** architecture using Trusted Execution Environments (TEEs):

1. **Client-Side Encryption**: Your API keys are encrypted on your device using your wallet's private key before being sent to our servers.
2. **Hardware Enclaves**: The keys are only decrypted inside a secure hardware enclave (Intel SGX/TDX) which guarantees that not even the server administrators can see the keys.
3. **Ephemeral Processing**: Requests are proxied through the enclave to the AI provider. The request body and keys are never logged or stored in plain text.
4. **End-to-End Privacy**: Your identity is cryptographically separated from your usage.
5. **Encrypted Persistence**: Keys are stored in our SQLite database solely as encrypted ciphertexts. We use AES-256-GCM encryption where the key is only known to the secure hardware enclave.

**Sample Encrypted Record:**
```javascript
{
    id: 'ae5110063bda2dbd332f1cd97cf59603:6421eb6536f87ff7d2c472804f9ef79703909ca667e6c8ed37be84968d294be56b843e8d1a73714355dbec0029c88e38',
    id_hash: '62cfa59ba5f3134ae8c8a772c18f7e4e45e37dbfd42f0a1dfc8589605208c57b',
    owner: '0x228D02A8c9c68f4Cf92788eFc68f9cB5323221C3',
    provider: 'anthropic',
    encrypted_data: '{"ciphertext":"361cf09f82e39e2487984d6637e6221d4932f06e43eafbb8b63fe029eda3965981d2bc180b9286d693638c9d8d6cb82e7548922537afea840e31fcca587fd6c9403c17cfec4b502d24b7fab8ea305a9ffda93054f7d243a7ab0fea676e82c90c74393818350e6360566c2357","iv":"3351bed4ae9d18f0a5794ca2","authTag":"7969311355d1cef37342616bd2c904c5","algorithm":"TEE_AES_GCM_SERVER","keyId":"teek_ee86075fb570290a","timestamp":1766335112873,"attestation":"{\\"version\\":2,\\"status\\":\\"OK\\",\\"timestamp\\":1766335112873,\\"enclaveId\\":\\"0x9377e3ce133bb0e722cd9af7488d062fc74988a2b6ad9c50bcf5530331c7bac5\\",\\"signature\\":\\"0xbd8a6abecb78eccfad3467a86a5a7d4ab069ea2a9a3a2443d1a2356ac7a644e88ca32d6f6dc6c1a9ea80739b009622a68b85804e870244c28f56aeac76917e2f\\",\\"quoteType\\":\\"TEE_QUOTE_V2_SERVER\\",\\"runtime\\":\\"ROFL_Pribado_Server_v2\\"}"}',
    iv: null,
    auth_tag: null,
    created_at: 1766335112874,
    last_rotated: 1766335112874,
    rotation_interval: 0,
    webhook_url: null,
    origin_key: 'ae5110063bda2dbd332f1cd97cf59603:6421eb6536f87ff7d2c472804f9ef79703909ca667e6c8ed37be84968d294be56b843e8d1a73714355dbec0029c88e38',
    origin_key_hash: '62cfa59ba5f3134ae8c8a772c18f7e4e45e37dbfd42f0a1dfc8589605208c57b',
    history: '[]',
    rofl_encrypted: '{"ciphertext":"361cf09f82e39e2487984d6637e6221d4932f06e43eafbb8b63fe029eda3965981d2bc180b9286d693638c9d8d6cb82e7548922537afea840e31fcca587fd6c9403c17cfec4b502d24b7fab8ea305a9ffda93054f7d243a7ab0fea676e82c90c74393818350e6360566c2357","iv":"3351bed4ae9d18f0a5794ca2","authTag":"7969311355d1cef37342616bd2c904c5","algorithm":"TEE_AES_GCM_SERVER","keyId":"teek_ee86075fb570290a","timestamp":1766335112873,"attestation":"{\\"version\\":2,\\"status\\":\\"OK\\",\\"timestamp\\":1766335112873,\\"enclaveId\\":\\"0x9377e3ce133bb0e722cd9af7488d062fc74988a2b6ad9c50bcf5530331c7bac5\\",\\"signature\\":\\"0xbd8a6abecb78eccfad3467a86a5a7d4ab069ea2a9a3a2443d1a2356ac7a644e88ca32d6f6dc6c1a9ea80739b009622a68b85804e870244c28f56aeac76917e2f\\",\\"quoteType\\":\\"TEE_QUOTE_V2_SERVER\\",\\"runtime\\":\\"ROFL_Pribado_Server_v2\\"}"}'
}
```

### Security & ROFL Architecture Analysis

The sample record demonstrates how the **Oasis ROFL (Runtime OFf-chain Logic)** framework secures your data:

1. **Ciphertext (`encrypted_data`)**: The API key is encrypted using `TEE_AES_GCM_SERVER`. This blob can **only** be decrypted by the specific ROFL instance that created it.
2. **Root of Trust (`keyId: teek_...`)**: This ID refers to a master key that is **not stored locally**. The ROFL runtime inside the Docker container must authenticate with the **Oasis Sapphire Blockchain** (using a hardware attestation) to retrieve this key into volatile memory.
3. **Hardware Verification (`attestation`)**: This field contains a digital signature from the CPU (Intel SGX), proving that the encryption code has not been tampered with.
4. **Zero-Knowledge Database**: The database only holds routing metadata (`provider`, `owner`). The secure key never touches the disk in plaintext.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js
```

## Disclaimer & Support

**Disclaimer**: This project is not built for enterprise scaling. If you choose to use this within a company, you do so at your own risk. The author is not liable for any damages or issues that may arise.

**Enterprise Use**: If you wish to use this in a corporate environment, you are encouraged to **self-host** and create your own Docker container.

**Support the Project**:
To maintain this project, mainnet access requires a minimal **$1/month** fee. This low cost ensures everyone can experience the mainnet without a high barrier to entry, and helps prevent spam.

If you find this project useful, please consider donating or purchasing a subscription:
👉 [pribado.dev](https://pribado.dev/) (Click "Upgrade" in the sidebar)

**Hire Me**:
If you are looking for IT services or consultation, feel free to send me a message.

Thank you for your support!

## License

MIT
