# Liqu Finance — Backend Agent

<div align="center">

![Liqu Finance](https://img.shields.io/badge/Liqu-Finance-6366f1?style=for-the-badge&logo=ethereum&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Unichain](https://img.shields.io/badge/Unichain-Sepolia-FF6B6B?style=for-the-badge)
![Gemini AI](https://img.shields.io/badge/Gemini-AI-4285F4?style=for-the-badge&logo=google&logoColor=white)

**AI-Powered Concentrated Liquidity Management Agent**

Autonomous on-chain liquidity management powered by Gemini AI for Uniswap V4 CLMM pools.

[Features](#features) • [Architecture](#architecture) • [Getting Started](#getting-started) • [API Reference](#api-reference) • [ERC-8004](#erc-8004-integration)

</div>

---

## 🎯 Overview

The **Liqu Finance Backend Agent** is an autonomous AI agent that manages concentrated liquidity positions on Uniswap V4 pools. It leverages Google's Gemini AI to analyze pool conditions and make intelligent decisions about minting, rebalancing, or closing liquidity positions based on configurable risk strategies.

### Key Highlights

- 🤖 **AI-Driven Decisions**: Uses Gemini 2.5 Flash for real-time pool analysis
- ⛓️ **ERC-8004 Compliant**: Implements decentralized AI agent identity & reputation standards
- 🔄 **Automated Rebalancing**: Continuously monitors and adjusts position ranges
- 📊 **Multiple Strategies**: Conservative, Balanced, and Degen risk profiles
- 🌐 **RESTful API**: Complete HTTP interface for frontend integration

---

## ✨ Features

### AI Pool Analysis

The agent uses Gemini AI to analyze real-time pool metrics including:

- Current tick and price
- Liquidity distribution
- Fee growth rates
- Position health

### Risk Strategies

| Strategy         | Tick Range  | Slippage | Rebalance Threshold | Description                                  |
| ---------------- | ----------- | -------- | ------------------- | -------------------------------------------- |
| **CONSERVATIVE** | ±120 ticks  | 0.5%     | 70%                 | Narrow range, low risk, frequent rebalancing |
| **BALANCED**     | ±600 ticks  | 1.0%     | 85%                 | Medium range, moderate risk                  |
| **DEGEN**        | ±3000 ticks | 3.0%     | 95%                 | Wide range, high yield potential             |

### Autonomous Operations

- **Position Minting**: Opens new concentrated liquidity positions
- **Position Closing**: Removes liquidity and collects fees
- **Rebalancing**: Closes out-of-range positions and re-mints with optimal tick range
- **Event Listening**: Monitors on-chain events for new deposits and agent assignments

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP API
┌─────────────────────────────▼───────────────────────────────────┐
│                      Backend Agent (Node.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │   API (Express)│  │ Gemini AI    │  │    Agent Loop         │   │
│  │   - /pool     │  │ Analyzer     │  │   - Process deposits   │   │
│  │   - /deposits │  └──────┬───────┘  │   - Execute decisions  │   │
│  │   - /agents   │         │          └───────────┬────────────┘   │
│  │   - /analyze  │◄────────┘                      │               │
│  └───────┬───────┘                                │               │
│          │                                        │               │
│  ┌───────▼────────────────────────────────────────▼──────────┐   │
│  │                 Smart Contract Services                     │   │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │  │ Pool Reader │  │ TX Executor│  │  ERC-8004 Services   │   │
│  │  │  - State    │  │  - Mint    │  │   - Identity         │   │
│  │  │  - Deposits │  │  - Close   │  │   - Reputation       │   │
│  │  │  - Positions│  │  - Rebal   │  │   - Validation       │   │
│  │  └─────────────┘  └────────────┘  └──────────────────────┘   │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ ethers.js / JSON-RPC
┌───────────────────────────────▼─────────────────────────────────┐
│                    Unichain Sepolia (Chain 1301)                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ CLMMLiquidity   │  │ CLMM Router     │  │ ERC-8004        │   │
│  │ Agent Contract  │  │                 │  │ Registries      │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Module Breakdown

| Module               | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `index.ts`           | Application entry point, starts API server and agent loop |
| `api.ts`             | Express REST API endpoints                                |
| `agent.ts`           | Core agent logic for deposit processing                   |
| `config.ts`          | Configuration, contract instances, strategy configs       |
| `pool-reader.ts`     | Pool state and position data retrieval                    |
| `tx-executor.ts`     | On-chain transaction execution (mint, close, rebalance)   |
| `gemini-analyzer.ts` | Gemini AI integration for pool analysis                   |
| `erc8004-service.ts` | ERC-8004 identity, reputation, validation services        |
| `event-listener.ts`  | On-chain event polling for deposits and assignments       |
| `types.ts`           | TypeScript type definitions                               |
| `logger.ts`          | Structured logging utilities                              |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A funded wallet on Unichain Sepolia
- Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/liqu-finance.git
cd liqu-finance/backend-agent

# Install dependencies
npm install
```

### Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Configure your `.env` file:

```env
# Unichain Sepolia
RPC_URL=https://sepolia.unichain.org
CHAIN_ID=1301

# Agent private key (use one of the registered agent keys)
AGENT_PRIVATE_KEY=your_private_key_here

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Contract addresses (pre-deployed on Unichain Sepolia)
CLMM_LIQUIDITY_AGENT=0xC2de233c348c1631a7F75bb7A4A640bc411a0C70
CLMM_ROUTER=0x11A74D375951D27a3E159a7B6CFfaa7B2A2cbC36
IDENTITY_REGISTRY=0x6F9E056e8ec94C81736823692C748566E36e6D8F
REPUTATION_REGISTRY=0xE7ec67588178B493938a88611999A5609222A2EC
VALIDATION_REGISTRY=0xB650bC862C3cB90adEC758C3101562099e71e176
```

### Running the Agent

```bash
# Development
npm start

# Build for production
npm run build
```

The agent will:

1. Start the Express API server on port 3001 (configurable via `PORT` env)
2. Begin polling for new deposit events
3. Start the main agent loop processing assigned deposits

---

## 📡 API Reference

The backend agent exposes a RESTful API for frontend integration. Full Swagger documentation is available at `/api-docs` when running the server.

### Pool Endpoints

| Method | Endpoint          | Description                                     |
| ------ | ----------------- | ----------------------------------------------- |
| GET    | `/api/pool/state` | Get current pool state (tick, price, liquidity) |

### Deposit Endpoints

| Method | Endpoint                       | Description                             |
| ------ | ------------------------------ | --------------------------------------- |
| GET    | `/api/deposits/user/:address`  | Get deposit IDs for a user              |
| GET    | `/api/deposits/agent/:address` | Get deposits assigned to an agent       |
| GET    | `/api/deposits/:id`            | Get deposit details by ID               |
| GET    | `/api/deposits/:id/positions`  | Get positions for a deposit             |
| GET    | `/api/deposits/recent`         | Get recent deposits from event listener |

### Position Endpoints

| Method | Endpoint                  | Description                      |
| ------ | ------------------------- | -------------------------------- |
| GET    | `/api/positions/:tokenId` | Get position details by token ID |

### Agent Endpoints (ERC-8004)

| Method | Endpoint                       | Description                      |
| ------ | ------------------------------ | -------------------------------- |
| GET    | `/api/agents/count`            | Get total registered agent count |
| GET    | `/api/agents/all`              | List all registered agents       |
| GET    | `/api/agents/:id`              | Get agent by ID                  |
| GET    | `/api/agents/address/:address` | Resolve agent by address         |
| GET    | `/api/agents/:id/reputation`   | Get agent reputation score       |

### Validation Endpoints

| Method | Endpoint                    | Description                        |
| ------ | --------------------------- | ---------------------------------- |
| GET    | `/api/validation/:dataHash` | Get validation status by data hash |

### Strategy & Analysis Endpoints

| Method | Endpoint                    | Description                             |
| ------ | --------------------------- | --------------------------------------- |
| GET    | `/api/strategies`           | Get all strategy configurations         |
| POST   | `/api/analyze`              | AI-powered pool analysis for a strategy |
| GET    | `/api/assign/:depositId`    | Get recommended agent for a deposit     |
| POST   | `/api/rebalance/:depositId` | Trigger rebalance for a deposit         |

### Example: Analyze Pool

```bash
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"strategy": "BALANCED"}'
```

**Response:**

```json
{
  "strategy": "BALANCED",
  "strategyConfig": {
    "tickRangeMultiplier": 10,
    "maxSlippage": 0.01,
    "rebalanceThreshold": 0.85,
    "description": "Medium range, moderate risk"
  },
  "pool": {
    "tick": -201600,
    "price": 2453.21,
    "liquidity": "123456789012345678"
  },
  "recommendation": {
    "action": "MINT",
    "tickLower": -202200,
    "tickUpper": -201000,
    "reason": "Current price is in a stable range. Recommended to mint a position with a ±600 tick range for optimal fee capture.",
    "confidence": 85
  },
  "agentAddress": "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607"
}
```

---

## 🔗 ERC-8004 Integration

This agent implements the **ERC-8004** standard for decentralized AI agent identity and reputation.

### Identity Registry

- Agents are registered with a unique ID and domain name
- Identity can be resolved by address or ID
- Agent registration verified before processing deposits

### Reputation System

- Tracks validation history and response rates
- Computes reputation score (0-100) based on:
  - Average validation scores (60% weight)
  - Response rate (20% weight)
  - Trust authorizations (20% weight)

### Validation Framework

- Requests validation before executing decisions
- Submits validation responses with confidence scores
- On-chain and in-memory validation tracking

---

## 📦 Smart Contracts

### Deployed Contracts (Unichain Sepolia)

| Contract             | Address                                      |
| -------------------- | -------------------------------------------- |
| CLMM Liquidity Agent | `0xC2de233c348c1631a7F75bb7A4A640bc411a0C70` |
| CLMM Router          | `0x11A74D375951D27a3E159a7B6CFfaa7B2A2cbC36` |
| Identity Registry    | `0x6F9E056e8ec94C81736823692C748566E36e6D8F` |
| Reputation Registry  | `0xE7ec67588178B493938a88611999A5609222A2EC` |
| Validation Registry  | `0xB650bC862C3cB90adEC758C3101562099e71e176` |

### Pool Configuration

| Parameter     | Value                                        |
| ------------- | -------------------------------------------- |
| Token0 (USDT) | `0x4dABf45C8cF333Ef1e874c3FDFC3C86799af80c8` |
| Token1 (WETH) | `0xf96c5C189a949C73745a277A4Acf071B1B9f6DF5` |
| Fee           | 0.3% (3000)                                  |
| Tick Spacing  | 60                                           |

---

## 🤖 Registered Agents

| Strategy     | Address                                      |
| ------------ | -------------------------------------------- |
| CONSERVATIVE | `0x5b6A404F8958E7e10028301549e61435925725Bf` |
| BALANCED     | `0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607` |
| DEGEN        | `0x5B20B5a4Bba73bC6363fBE90E6b2Ab4fFF5C820e` |

---

## 📝 License

ISC License

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

<div align="center">
Built with ❤️ for the Hackathon
</div>
