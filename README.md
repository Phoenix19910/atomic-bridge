# AtomicBridge — Sovereign Cross-Border FX PvP Settlement Corridor

> **Enterprise-grade sovereign foreign exchange settlement infrastructure built on Hyperledger Fabric 2.5.**  
> Features **Payment-versus-Payment (PvP)** atomic swaps across jurisdictions (India & Singapore), real-time regulatory compliance controls (RBI & MAS), and autonomous trade expiry surveillance.

---

## 🏛️ Architecture Overview

AtomicBridge interconnects commercial banking institutions and sovereign central banks across international currency corridors:

\  +-------------------------------------------------------------------------------+
  |                              corridor-channel                                 |
  |                                                                               |
  |   [ BankA-MSP ] <------- Cross-Border PvP Trade ------> [ BankC-MSP ]         |
  |    (India Leg: INR)                                      (Singapore Leg: USD)  |
  |          |                                                     |              |
  |          v                                                     v              |
  |   [  RBI-MSP  ]                                         [  MAS-MSP  ]         |
  |   Central Bank / Regulator                              Monetary Authority    |
  |   (Compliance & Auto-Refund)                            (FX Rate Surveillance)|
  +-------------------------------------------------------------------------------+
- **Channel:** \corridor-channel- **Smart Contract (Chaincode):** \tomicbridge\ (Node.js / TypeScript)
- **Consensus:** Raft Consensus Orderer (\orderer.corridor.example.com:10050\)
- **Member Organizations:**
  - \BankA-MSP\ (Commercial Bank - India, Peer: \peer0.banka.india:10051\)
  - \RBI-MSP\ (Regulator - Reserve Bank of India, Peer: \peer0.rbi.india:10052\)
  - \BankC-MSP\ (Commercial Bank - Singapore, Peer: \peer0.bankc.singapore:12051\)
  - \MAS-MSP\ (Regulator - Monetary Authority of Singapore, Peer: \peer0.mas.singapore:12052\)

---

## 🚀 Repository Structure

pp/
├── backend/            # Express.js & TypeScript API Gateway & Expiry Watcher
│   ├── src/
│   │   ├── fabric/     # Hyperledger Fabric Gateway client connections
│   │   ├── routes/     # Trade, Admin, RTGS, Audit, and Watcher routes
│   │   ├── services/   # ExpiryWatcher background service & SSE broker
│   │   └── app.ts      # Server entrypoint
├── chaincode/          # Fabric Smart Contract (TypeScript)
│   └── src/
│       └── atomicBridgeContract.ts  # Atomic swap, escrow lock, settlement & refund logic
├── frontend/           # Modern React + TypeScript + Vite Dashboard
│   └── src/            # Institutional PvP swapping & regulatory monitoring UI
├── network/            # Hyperledger Fabric network configuration & crypto artifacts
│   ├── docker-compose.yaml
│   ├── configtx.yaml
│   ├── crypto-config.yaml
│   ├── collections_config.json
│   └── organizations/  # MSP cryptogen certificates
└── docs/               # Architecture diagrams, specifications, & API contracts
---

## ⚡ Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v20+ recommended)
- Hyperledger Fabric binaries (v2.5+)

### 2. Start the Hyperledger Fabric Network
\ash
cd network
docker compose up -d
### 3. Deploy the Smart Contract
\ash
cd chaincode
npm install
npm run build

# Package and deploy via peer lifecycle on corridor-channel
cd ../network
peer lifecycle chaincode package atomicbridge.tar.gz --path ../chaincode --lang node --label atomicbridge_1.0
# (Install on all 4 peers, approve for all 4 orgs, and commit)
### 4. Run the Backend API Gateway
\ash
cd backend
npm install
npm run build
npm start
# API Gateway listens on http://localhost:4000
### 5. Run the Frontend Dashboard
\ash
cd frontend
npm install
npm run dev
# Dashboard available at http://localhost:5173
---

## 📡 Core API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| \GET\ | \/api/health\ | System status, Fabric connectivity & watcher scan metrics |
| \GET\ | \/api/balances\ | On-chain token balances for all participating institutions |
| \GET\ | \/api/trades\ | Query all active and historical cross-border trades |
| \POST\ | \/api/trades/initiate\ | Initiate a new cross-border trade agreement |
| \POST\ | \/api/trades/:tradeId/lock\ | Lock Leg 1 (INR) or Leg 2 (USD) in cryptographic escrow |
| \POST\ | \/api/trades/:tradeId/settle\ | Atomically execute PvP settlement across both legs |
| \POST\ | \/api/trades/:tradeId/refund\ | Cancel or refund expired/unmatched trades |
| \GET\ | \/api/rules/:jurisdiction\ | Get regulatory corridor limits (RBI or MAS) |
| \GET\ | \/api/watcher/status\ | Current status of the autonomous background refund watcher |
| \GET\ | \/api/events/stream\ | Server-Sent Events (SSE) live blockchain trade feed |

---

## 🛡️ Sovereign Regulatory & PvP Mechanics

1. **Deterministic Ledger State:** All state modifications use strict cryptographic key determinism to prevent endorsement divergence.
2. **Payment-versus-Payment (PvP):** Neither leg settles unless both legs are verified locked in escrow within tolerance limits.
3. **Autonomous Refund Watcher:** The RBI regulator MSP runs continuous surveillance scans. If a trade reaches expiration without settlement, escrows are safely refunded back to their respective owners.
