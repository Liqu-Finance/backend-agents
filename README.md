# Liqu Finance — Backend Agent

<div align="center">

![Liqu Finance](https://img.shields.io/badge/Liqu-Finance-6366f1?style=for-the-badge&logo=ethereum&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Unichain](https://img.shields.io/badge/Unichain-Sepolia-FF6B6B?style=for-the-badge)

**AI-Powered Concentrated Liquidity Management Agent for Uniswap V4**

</div>

---

## Overview

Autonomous agent that manages USDT/WETH concentrated liquidity positions on Uniswap V4 (Unichain Sepolia). Uses AI to analyze pool state and automatically mint, rebalance, or close positions based on configurable risk strategies.

**Key Features:**

- AI-powered position analysis (OpenAI, Gemini, or Kimi)
- Three risk strategies: Conservative, Balanced, Degen
- Automatic fallback to rule-based decisions when AI is unavailable
- ERC-8004 on-chain identity and reputation tracking
- REST API with Swagger documentation

📚 **Live API Docs:** [https://backend-agent-seven.vercel.app/api-docs](https://backend-agent-seven.vercel.app/api-docs)

---

## How It Works

```
User Deposit → Agent Polls → AI Analysis → Execute Transaction
                                  ↓
                         ERC-8004 Validation
```

1. User deposits tokens via smart contract and assigns to an agent
2. Agent detects the deposit and reads pool state
3. AI analyzes current tick, price, and liquidity to recommend action
4. Agent executes MINT/REBALANCE/CLOSE on-chain
5. Transaction hashes returned for tracking

---

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Set: RPC_URL, AGENT_PRIVATE_KEY, LLM keys, contract addresses

# Run
npm start
```

Server runs on `http://localhost:3001`. API docs at `/api-docs`.

---

## Environment Variables

```env
# Network
RPC_URL=https://sepolia.unichain.org
CHAIN_ID=1301
AGENT_PRIVATE_KEY=<your-private-key>

# LLM Provider: "openai", "gemini", or "kimi"
LLM_PROVIDER=openai

# API Keys (based on provider)
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>
KIMI_API_KEY=<key>
KIMI_MODEL=kimi-k2.5

# Contracts
CLMM_LIQUIDITY_AGENT=0xC2de233c348c1631a7F75bb7A4A640bc411a0C70
CLMM_ROUTER=0x11A74D375951D27a3E159a7B6CFfaa7B2A2cbC36
IDENTITY_REGISTRY=0x6F9E056e8ec94C81736823692C748566E36e6D8F
REPUTATION_REGISTRY=0xE7ec67588178B493938a88611999A5609222A2EC
VALIDATION_REGISTRY=0xB650bC862C3cB90adEC758C3101562099e71e176
```

---

## API Endpoints

> **💡 Production Note:** In production, you only need to call `POST /api/agent/run`. The agent automatically handles everything:
>
> - Detects all assigned deposits
> - Checks if positions are out of range
> - Auto-rebalances when price moves outside tick range
> - Mints new positions for deposits without any
>
> The `/run/:depositId`, `/close/:depositId`, and `/rebalance/:depositId` endpoints are for manual control and testing only.

### Agent Operations

| Method | Endpoint                      | Description                                       |
| ------ | ----------------------------- | ------------------------------------------------- |
| POST   | `/api/agent/run`              | **[Primary]** Run agent for all assigned deposits |
| POST   | `/api/agent/run/:depositId`   | Run agent for specific deposit (manual)           |
| POST   | `/api/agent/close/:depositId` | Close all positions for a deposit (manual)        |
| GET    | `/api/agent/status`           | Get agent initialization status                   |

### Pool & Deposits

| Method | Endpoint                       | Description                                 |
| ------ | ------------------------------ | ------------------------------------------- |
| GET    | `/api/pool/state`              | Current pool state (tick, price, liquidity) |
| GET    | `/api/deposits/:id`            | Deposit details by ID                       |
| GET    | `/api/deposits/user/:address`  | User's deposit IDs                          |
| GET    | `/api/deposits/agent/:address` | Deposits assigned to agent                  |
| GET    | `/api/positions/:tokenId`      | Position details                            |

### Analysis & Strategy

| Method | Endpoint                    | Description                   |
| ------ | --------------------------- | ----------------------------- |
| POST   | `/api/analyze`              | AI pool analysis for strategy |
| GET    | `/api/strategies`           | All strategy configurations   |
| POST   | `/api/rebalance/:depositId` | Trigger rebalance             |

### ERC-8004 (Identity & Reputation)

| Method | Endpoint                     | Description             |
| ------ | ---------------------------- | ----------------------- |
| GET    | `/api/agents/count`          | Total registered agents |
| GET    | `/api/agents/:id`            | Agent by ID             |
| GET    | `/api/agents/:id/reputation` | Agent reputation score  |
| GET    | `/api/validation/:dataHash`  | Validation status       |

---

## Example: Run Agent for Deposit

```bash
curl -X POST http://localhost:3001/api/agent/run/1
```

**Response:**

```json
{
  "agentId": 1,
  "agentDomain": "conservative.liqu.finance",
  "depositId": 1,
  "pool": {
    "tick": -62147,
    "price": 2453.21,
    "liquidity": "2727525614538322453050"
  },
  "status": "processed",
  "action": "MINT",
  "tickLower": -62220,
  "tickUpper": -62100,
  "confidence": 85,
  "txHashes": ["0xabc123..."],
  "message": "Deposit #1 processed successfully"
}
```

## Example: Close Positions

```bash
curl -X POST http://localhost:3001/api/agent/close/1
```

**Response:**

```json
{
  "agentId": 1,
  "depositId": 1,
  "status": "success",
  "positionsClosed": 2,
  "closedTokenIds": [12345, 12346],
  "txHashes": ["0xabc...", "0xdef..."],
  "message": "Successfully closed 2 position(s)"
}
```

---

## Strategies

| Strategy     | Tick Range  | Risk Level | Description                        |
| ------------ | ----------- | ---------- | ---------------------------------- |
| CONSERVATIVE | ±120 ticks  | Low        | Narrow range, frequent rebalancing |
| BALANCED     | ±600 ticks  | Medium     | Moderate range, balanced approach  |
| DEGEN        | ±3000 ticks | High       | Wide range, maximum fee capture    |

---

## Registered Agents (Unichain Sepolia)

| Strategy     | Address                                      |
| ------------ | -------------------------------------------- |
| CONSERVATIVE | `0x5b6A404F8958E7e10028301549e61435925725Bf` |
| BALANCED     | `0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607` |
| DEGEN        | `0x5B20B5a4Bba73bC6363fBE90E6b2Ab4fFF5C820e` |

---

## Fallback Mode

When AI is unavailable (API error, rate limit), the agent automatically falls back to rule-based decisions:

- No positions → MINT with strategy-configured tick range
- Position out of range → REBALANCE
- Position in range → HOLD

---

<div align="center">

**Built for ETH Global Hackathon 2026**

</div>
