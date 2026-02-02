# OpenClaw Honeypot

A comprehensive honeypot that mimics the [OpenClaw](https://github.com/openclaw/openclaw) personal AI assistant infrastructure for security research purposes.

## Disclaimer

**This tool is for authorized security research only.**

- Only deploy on networks and systems you own or have explicit permission to test
- All traffic is logged for analysis - handle captured data responsibly
- Do not use for malicious purposes
- Follow responsible disclosure practices for any vulnerabilities discovered

## Features

- **Full Gateway Protocol**: Mimics the OpenClaw WebSocket protocol with realistic responses
- **Control UI**: Convincing web interface that captures credentials
- **Channel Webhooks**: Simulates WhatsApp, Telegram, Discord, Slack, Signal endpoints
- **Comprehensive Logging**: Logs all traffic, requests, and authentication attempts
- **Attack Detection**: Detects SQL injection, XSS, command injection, path traversal, and prompt injection
- **SQLite Database**: Stores all captured data for analysis

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/openclaw-honeypot.git
cd openclaw-honeypot

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

### Manual Installation

```bash
# Prerequisites: Node.js 22+

# Install dependencies
npm install

# Initialize database
npx prisma db push

# Start the honeypot
npm run dev  # Development
npm start    # Production
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:18789/` | Control UI (captures credentials) |
| `ws://localhost:18789/` | WebSocket gateway |
| `http://localhost:18789/health` | Health check |
| `http://localhost:18789/webhook/whatsapp` | WhatsApp webhook |
| `http://localhost:18789/bot{token}/*` | Telegram Bot API |
| `http://localhost:18789/webhook/discord` | Discord webhook |
| `http://localhost:18789/slack/*` | Slack webhooks |
| `http://localhost:18789/webhook/signal` | Signal webhook |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=18789
BIND_ADDRESS=0.0.0.0

# Database (SQLite)
DATABASE_URL="file:./honeypot.db"

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_PATH=./logs

# Fake OpenClaw settings
FAKE_VERSION=2026.2.1
FAKE_GATEWAY_TOKEN=your-fake-token

# Alerting (optional)
# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

## Database Schema

The honeypot captures:

- **Connections**: IP addresses, user agents, GeoIP data
- **HTTP Requests**: Full headers, bodies, response codes
- **WebSocket Messages**: All frames, methods, payloads
- **Auth Attempts**: Tokens, passwords, client info
- **Channel Interactions**: Webhook payloads, sender IDs
- **Suspicious Activity**: Detected attacks with severity

## Analyzing Captured Data

### Using Prisma Studio

```bash
npx prisma studio
```

### Sample Queries

```sql
-- Recent connections
SELECT * FROM Connection ORDER BY connectedAt DESC LIMIT 100;

-- Authentication attempts
SELECT ipAddress, method, credential, success, timestamp
FROM AuthAttempt ORDER BY timestamp DESC;

-- Suspicious activity summary
SELECT type, severity, COUNT(*) as count
FROM SuspiciousActivity
GROUP BY type, severity;

-- Top attacker IPs
SELECT ipAddress, requestCount, wsMessageCount, authAttemptCount, suspiciousCount
FROM AttackerSession
ORDER BY suspiciousCount DESC LIMIT 10;
```

## Protocol Reference

### WebSocket Handshake

Client sends:
```json
{
  "minProtocol": 1,
  "maxProtocol": 1,
  "client": {
    "id": "client-123",
    "version": "1.0.0",
    "platform": "linux",
    "mode": "control-ui"
  },
  "auth": {
    "token": "captured-token"
  }
}
```

Server responds:
```json
{
  "type": "hello-ok",
  "protocol": 1,
  "server": {
    "version": "2026.2.1",
    "connId": "uuid"
  },
  "features": {
    "methods": ["health", "channels.status", ...],
    "events": ["agent", "chat", "tick", ...]
  }
}
```

### Request/Response

Request:
```json
{
  "type": "req",
  "id": "req-1",
  "method": "channels.status",
  "params": {}
}
```

Response:
```json
{
  "type": "res",
  "id": "req-1",
  "ok": true,
  "payload": { ... }
}
```

## Attack Detection

The honeypot detects:

| Attack Type | Severity | Examples |
|-------------|----------|----------|
| SQL Injection | High | `' OR 1=1--`, `UNION SELECT` |
| Command Injection | Critical | `; cat /etc/passwd`, `$(whoami)` |
| XSS | Medium | `<script>`, `javascript:` |
| Path Traversal | High | `../../../etc/passwd` |
| Prompt Injection | Medium | `ignore previous instructions` |
| Scanner Activity | Low | `/wp-admin`, `/.git/` |
| Exploits | Critical | `log4j`, `jndi:ldap` |

## Project Structure

```
openclaw-honeypot/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Configuration
│   ├── gateway/
│   │   ├── server.ts      # HTTP/WS server
│   │   ├── websocket.ts   # WebSocket handler
│   │   ├── protocol.ts    # Protocol types
│   │   └── handlers.ts    # Method handlers
│   ├── channels/
│   │   └── index.ts       # Channel webhooks
│   ├── logging/
│   │   ├── logger.ts      # Winston logger
│   │   └── analyzer.ts    # Attack detection
│   └── database/
│       ├── client.ts      # Prisma client
│       └── queries.ts     # DB operations
├── web/
│   ├── index.html         # Control UI
│   ├── styles/
│   │   └── openclaw.css   # Styles
│   └── js/
│       └── app.js         # Frontend JS
├── prisma/
│   └── schema.prisma      # Database schema
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) for details.

## Related Projects

- [OpenClaw](https://github.com/openclaw/openclaw) - The real OpenClaw personal AI assistant
- [Cowrie](https://github.com/cowrie/cowrie) - SSH/Telnet honeypot
- [HoneyPy](https://github.com/foospidy/HoneyPy) - Low interaction honeypot

---

**Remember: This is for authorized security research only. Use responsibly.**
