# 🏠 Self-Hosting Pribado

This guide will help you deploy your own Pribado instance for complete data sovereignty.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Production Deployment](#production-deployment)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Security Hardening](#security-hardening)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Minimum Requirements
- **CPU**: 1 vCPU
- **RAM**: 1 GB
- **Storage**: 10 GB SSD
- **OS**: Ubuntu 22.04 LTS / Debian 12 / macOS

### Software Requirements
- **Node.js**: v20+ (LTS)
- **npm**: v10+
- **Docker** (optional): v24+
- **Git**: v2.40+

---

## Quick Start (Docker)

The fastest way to get Pribado running.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/pribado.git
cd pribado
```

### 2. Create Environment File

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# REQUIRED: Generate a secure 64-char hex secret
ENCLAVE_SECRET=$(openssl rand -hex 32)

# Optional: Oasis Sapphire (for blockchain features)
SAPPHIRE_PRIVATE_KEY=your_private_key_here
SAPPHIRE_RPC_URL=https://testnet.sapphire.oasis.dev


### 3. Start with Docker Compose

```bash
docker-compose up -d
```

That's it! Pribado is now running at `http://localhost:3000`

### 4. Verify Installation

```bash
# Check containers are running
docker-compose ps

# View logs
docker-compose logs -f
```

---

## Manual Installation

For development or non-Docker environments.

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/your-username/pribado.git
cd pribado
npm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
nano .env.local
```

Required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCLAVE_SECRET` | 64-char hex string for encryption | ✅ Yes |
| `SAPPHIRE_PRIVATE_KEY` | Oasis wallet private key | ❌ Optional |
| `SAPPHIRE_RPC_URL` | Oasis RPC endpoint | ❌ Optional |


Generate `ENCLAVE_SECRET`:
```bash
openssl rand -hex 32
```

### 3. Build the Application

```bash
npm run build
```

### 4. Start the Server

```bash
# Start the main application
npm start

# In a separate terminal, start the chat server (optional)
ENCLAVE_SECRET=your_secret node server/runChatServer.js
```

### 5. Access Pribado

Open `http://localhost:3000` in your browser.

---

## Configuration

### Environment Variables Reference

```bash
# ============================================
# CORE CONFIGURATION (REQUIRED)
# ============================================

# Encryption key for all sensitive data
# Generate with: openssl rand -hex 32
ENCLAVE_SECRET=your_64_char_hex_secret_here

# ============================================
# BLOCKCHAIN (OPTIONAL - for Sapphire features)
# ============================================

# Your Oasis Sapphire wallet private key
SAPPHIRE_PRIVATE_KEY=

# RPC URL (testnet or mainnet)
SAPPHIRE_RPC_URL=https://testnet.sapphire.oasis.dev
# Mainnet: https://sapphire.oasis.io

# ============================================
# HARDWARE ENCLAVE (SAPPHIRE) INTEGRATION
# ============================================

# For enhanced security, you can store your ENCLAVE_SECRET inside a TEE Smart Contract.
# We provide a Key Manager contract for this purpose.
# Location: contracts_deploy/contracts/EnclaveKeyManager.sol

# Live Example (Sapphire Testnet):
# https://explorer.oasis.io/testnet/sapphire/address/0xA986239da922E15d7148E0C7242040a8BcAF39f8/code#code


# ============================================
# CHAT SERVER (OPTIONAL)
# ============================================

CHAT_PORT=3002
NEXT_API_URL=http://localhost:3000

# ============================================
# ADVANCED
# ============================================

# Production mode
NODE_ENV=production

# Port configuration
PORT=3000
HOSTNAME=0.0.0.0
```

### Data Persistence

All data is stored in the `./data` directory:

```
data/
├── pribado.sqlite    # Main database (encrypted)
└── *.sqlite-wal      # Write-ahead log
```

**Important**: Back up the `data/` directory and your `ENCLAVE_SECRET` together. Without both, data cannot be recovered.

---

## Production Deployment

### Option 1: Docker on VPS

```bash
# SSH into your server
ssh user@your-server

# Clone and configure
git clone https://github.com/your-username/pribado.git
cd pribado
cp .env.local.example .env.local
nano .env.local  # Add your secrets

# Build and run
docker-compose up -d --build
```

### Option 2: PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Build
npm run build

# Start with PM2
pm2 start npm --name "pribado" -- start
pm2 start server/runChatServer.js --name "pribado-chat"

# Save and enable startup
pm2 save
pm2 startup
```

### Option 3: Systemd Service

Create `/etc/systemd/system/pribado.service`:

```ini
[Unit]
Description=Pribado Private API
After=network.target

[Service]
Type=simple
User=pribado
WorkingDirectory=/opt/pribado
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/pribado/.env.local

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable pribado
sudo systemctl start pribado
```

---

## Reverse Proxy Setup

### Nginx (Recommended)

Create `/etc/nginx/sites-available/pribado`:

```nginx
server {
    listen 80;
    server_name pribado.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pribado.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pribado.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pribado.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Main app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Chat WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/pribado /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Get SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pribado.yourdomain.com
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Secure the ENCLAVE_SECRET

Never commit your `.env.local` file. The `ENCLAVE_SECRET` is the master key for all encrypted data.

```bash
# Generate a strong secret
openssl rand -hex 32 > ~/.pribado_secret
chmod 600 ~/.pribado_secret

# Load in shell
export ENCLAVE_SECRET=$(cat ~/.pribado_secret)
```

### 3. Database Backup

```bash
# Create backup script
cat > /opt/pribado/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups/pribado
mkdir -p $BACKUP_DIR
cp /opt/pribado/data/pribado.sqlite $BACKUP_DIR/pribado_$DATE.sqlite
# Keep only last 7 days
find $BACKUP_DIR -name "*.sqlite" -mtime +7 -delete
EOF

chmod +x /opt/pribado/backup.sh

# Add to cron (daily at 2 AM)
echo "0 2 * * * /opt/pribado/backup.sh" | crontab -
```

### 4. Rate Limiting (Nginx)

Add to nginx config:

```nginx
# In http block
limit_req_zone $binary_remote_addr zone=pribado:10m rate=10r/s;

# In server block
location /api/ {
    limit_req zone=pribado burst=20 nodelay;
    proxy_pass http://127.0.0.1:3000;
}
```

---

## Troubleshooting

### Common Issues

#### 1. "ENCLAVE_SECRET not set"

```bash
# Check if variable is set
echo $ENCLAVE_SECRET

# Generate and set
export ENCLAVE_SECRET=$(openssl rand -hex 32)
```

#### 2. Database locked

```bash
# Stop all processes
docker-compose down
# or
pm2 stop all

# Remove stale locks
rm -f data/*.sqlite-wal data/*.sqlite-shm

# Restart
docker-compose up -d
```

#### 3. Chat not connecting

Check that `ENCLAVE_SECRET` is the same for both the main app and chat server.

```bash
# Both should output the same value
docker exec pribado-web printenv ENCLAVE_SECRET
docker exec pribado-chat printenv ENCLAVE_SECRET
```

#### 4. Port already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill if needed
kill -9 <PID>
```

### Logs

```bash
# Docker logs
docker-compose logs -f web
docker-compose logs -f chat

# PM2 logs
pm2 logs pribado
pm2 logs pribado-chat

# System logs
journalctl -u pribado -f
```

### Health Check

```bash
# Check if app is responding
curl -I http://localhost:3000

# Check API
curl http://localhost:3000/api/health
```

---

## Support

- **GitHub Issues**: [github.com/your-username/pribado/issues](https://github.com/your-username/pribado/issues)
- **Documentation**: [pribado.dev/docs](https://pribado.dev/docs)

---

## License

MIT License - see [LICENSE](LICENSE) for details.
