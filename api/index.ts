import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import { contracts, STRATEGY_CONFIG, POOL_PARAMS } from "../src/config";
import {
  getPoolState,
  getDepositInfo,
  getPositionInfo,
  getMyAssignedDeposits,
  tickToPrice,
} from "../src/pool-reader";
import { getTotalAgents, getValidationStatus, getAgentReputation, requestValidation, submitValidationResponse } from "../src/erc8004-service";
import { analyzePoolWithGemini } from "../src/gemini-analyzer";
import { executeRebalance } from "../src/tx-executor";
import { initAgent, runAgentOnce, runAgentForDeposit, closePositionsForDeposit, getAgentInfo } from "../src/agent";
import { STRATEGY_MAP, StrategyName } from "../src/types";
import { log, logError } from "../src/logger";

// BigInt-safe JSON serializer
function serialize(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

const app = express();
app.use(cors());
app.use(express.json());

// OpenAPI Spec for Swagger
const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Liqu Finance Backend Agent API",
    version: "1.0.0",
    description: "AI-Powered Concentrated Liquidity Management Agent API for Uniswap V4 CLMM pools on Unichain Sepolia."
  },
  servers: [{ url: "https://backend-agent-seven.vercel.app", description: "Production" }],
  paths: {
    "/api/health": { get: { summary: "Health check", tags: ["System"], responses: { 200: { description: "OK" } } } },
    "/api/pool/state": { get: { summary: "Get current pool state", tags: ["Pool"], responses: { 200: { description: "Pool state" } } } },
    "/api/deposits/user/{address}": { get: { summary: "Get deposits by user", tags: ["Deposits"], parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deposit IDs" } } } },
    "/api/deposits/agent/{address}": { get: { summary: "Get deposits by agent", tags: ["Deposits"], parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deposit IDs" } } } },
    "/api/deposits/{id}": { get: { summary: "Get deposit details", tags: ["Deposits"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Deposit info" } } } },
    "/api/deposits/{id}/positions": { get: { summary: "Get deposit positions", tags: ["Deposits"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Position list" } } } },
    "/api/positions/{tokenId}": { get: { summary: "Get position details", tags: ["Positions"], parameters: [{ name: "tokenId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Position info" } } } },
    "/api/agents/count": { get: { summary: "Get total agent count", tags: ["Agents"], responses: { 200: { description: "Agent count" } } } },
    "/api/agents/all": { get: { summary: "List all agents", tags: ["Agents"], responses: { 200: { description: "Agent list" } } } },
    "/api/agents/{id}": { get: { summary: "Get agent by ID", tags: ["Agents"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Agent info" } } } },
    "/api/agents/address/{address}": { get: { summary: "Resolve agent by address", tags: ["Agents"], parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Agent info" } } } },
    "/api/agents/{id}/reputation": { get: { summary: "Get agent reputation", tags: ["Agents"], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Reputation data" } } } },
    "/api/validation/{dataHash}": { get: { summary: "Get validation status", tags: ["Validation"], parameters: [{ name: "dataHash", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Validation status" } } } },
    "/api/strategies": { get: { summary: "Get all strategies", tags: ["Strategies"], responses: { 200: { description: "Strategy configs" } } } },
    "/api/analyze": { post: { summary: "AI pool analysis", tags: ["Analysis"], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { strategy: { type: "string", enum: ["CONSERVATIVE", "BALANCED", "DEGEN"] } } } } } }, responses: { 200: { description: "Analysis result" } } } },
    "/api/assign/{depositId}": { get: { summary: "Get agent assignment", tags: ["Operations"], parameters: [{ name: "depositId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Assignment info" } } } },
    "/api/rebalance/{depositId}": { post: { summary: "Trigger rebalance", tags: ["Operations"], parameters: [{ name: "depositId", in: "path", required: true, schema: { type: "integer" } }], responses: { 200: { description: "Rebalance result" } } } },
    "/api/agent/run": { 
      post: { 
        summary: "Run agent once (Demo)", 
        tags: ["Operations"], 
        description: "Triggers a single run of the agent logic to process all assigned deposits", 
        responses: { 
          200: { 
            description: "Agent run result",
            content: {
              "application/json": {
                example: {
                  agentId: 2,
                  agentDomain: "liqu-balanced.agent",
                  agentAddress: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607",
                  pool: {
                    tick: -201600,
                    price: 2453.21,
                    liquidity: "123456789012345678"
                  },
                  depositsProcessed: 2,
                  depositResults: [
                    {
                      depositId: 1,
                      status: "processed",
                      message: "Deposit #1 processed successfully",
                      action: "MINT",
                      tickLower: -202200,
                      tickUpper: -201000,
                      newTokenId: 12345,
                      txHash: "0xabc123..."
                    },
                    {
                      depositId: 3,
                      status: "processed",
                      message: "Deposit #3 processed successfully",
                      action: "HOLD",
                      reason: "Position is still in range"
                    }
                  ],
                  timestamp: 1707400000000
                }
              }
            }
          } 
        } 
      } 
    },
    "/api/agent/run/{depositId}": {
      post: {
        summary: "Run agent for specific deposit",
        tags: ["Operations"],
        description: "Triggers the agent to process a specific deposit by ID",
        parameters: [{ name: "depositId", in: "path", required: true, schema: { type: "integer" }, description: "Deposit ID to process" }],
        responses: {
          200: {
            description: "Single deposit run result",
            content: {
              "application/json": {
                example: {
                  agentId: 2,
                  agentDomain: "liqu-balanced.agent",
                  agentAddress: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607",
                  depositId: 1,
                  pool: {
                    tick: -201600,
                    price: 2453.21,
                    liquidity: "123456789012345678"
                  },
                  status: "processed",
                  action: "MINT",
                  tickLower: -202200,
                  tickUpper: -201000,
                  newTokenId: 12345,
                  message: "Deposit #1 processed successfully",
                  timestamp: 1707400000000
                }
              }
            }
          },
          400: { description: "Invalid deposit ID" },
          500: { description: "Failed to run agent for deposit" }
        }
      }
    },
    "/api/agent/close/{depositId}": {
      post: {
        summary: "Close all positions for deposit",
        tags: ["Operations"],
        description: "Closes all open positions for a specific deposit, returning tokens to the deposit balance",
        parameters: [{ name: "depositId", in: "path", required: true, schema: { type: "integer" }, description: "Deposit ID to close positions for" }],
        responses: {
          200: {
            description: "Close positions result",
            content: {
              "application/json": {
                example: {
                  agentId: 2,
                  agentDomain: "liqu-balanced.agent",
                  agentAddress: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607",
                  depositId: 1,
                  pool: {
                    tick: -201600,
                    price: 2453.21,
                    liquidity: "123456789012345678"
                  },
                  status: "success",
                  positionsClosed: 2,
                  closedTokenIds: [12345, 12346],
                  txHashes: [
                    "0xabc123def456789...",
                    "0xdef789abc123456..."
                  ],
                  message: "Successfully closed 2 position(s) for deposit #1",
                  timestamp: 1707400000000
                }
              }
            }
          },
          400: { description: "Invalid deposit ID" },
          500: { description: "Failed to close positions" }
        }
      }
    },
    "/api/agent/status": { get: { summary: "Get agent status", tags: ["Operations"], responses: { 200: { description: "Agent status" } } } }
  }
};

// Swagger UI HTML using CDN (Vercel compatible)
const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liqu Finance API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;

// Swagger endpoints
app.get("/api-docs", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(swaggerHtml);
});

app.get("/api-docs.json", (_req, res) => {
  res.json(openApiSpec);
});

// ─── Health Check ────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// ─── Pool ────────────────────────────────────
app.get("/api/pool/state", async (_req, res) => {
  try {
    const state = await getPoolState();
    const price = tickToPrice(state.tick);
    res.json(
      serialize({
        ...state,
        price,
        token0: POOL_PARAMS.token0,
        token1: POOL_PARAMS.token1,
        fee: POOL_PARAMS.fee,
        tickSpacing: POOL_PARAMS.tickSpacing,
      })
    );
  } catch (error) {
    logError("GET /api/pool/state failed", error);
    res.status(500).json({ error: "Failed to fetch pool state" });
  }
});

// ─── Deposits ────────────────────────────────
app.get("/api/deposits/user/:address", async (req, res) => {
  try {
    const ids = await contracts.agent.getUserDeposits(req.params.address);
    res.json({ depositIds: ids.map(Number) });
  } catch (error) {
    logError("GET /api/deposits/user/:address failed", error);
    res.status(500).json({ error: "Failed to fetch user deposits" });
  }
});

app.get("/api/deposits/agent/:address", async (req, res) => {
  try {
    const ids = await getMyAssignedDeposits(req.params.address);
    res.json({ depositIds: ids });
  } catch (error) {
    logError("GET /api/deposits/agent/:address failed", error);
    res.status(500).json({ error: "Failed to fetch agent deposits" });
  }
});

app.get("/api/deposits/:id/positions", async (req, res) => {
  try {
    const depositId = Number(req.params.id);
    const deposit = await getDepositInfo(depositId);
    const positions = [];
    for (const tokenId of deposit.positionTokenIds) {
      const pos = await getPositionInfo(tokenId);
      positions.push(pos);
    }
    res.json(
      serialize({
        depositId,
        strategy: STRATEGY_MAP[deposit.strategy],
        positions,
      })
    );
  } catch (error) {
    logError("GET /api/deposits/:id/positions failed", error);
    res.status(500).json({ error: "Failed to fetch deposit positions" });
  }
});

app.get("/api/deposits/:id", async (req, res) => {
  try {
    const depositId = Number(req.params.id);
    const deposit = await getDepositInfo(depositId);
    res.json(
      serialize({
        depositId,
        ...deposit,
        strategyName: STRATEGY_MAP[deposit.strategy],
      })
    );
  } catch (error) {
    logError("GET /api/deposits/:id failed", error);
    res.status(500).json({ error: "Failed to fetch deposit" });
  }
});

// ─── Positions ───────────────────────────────
app.get("/api/positions/:tokenId", async (req, res) => {
  try {
    const tokenId = Number(req.params.tokenId);
    const pos = await getPositionInfo(tokenId);
    res.json(serialize(pos));
  } catch (error) {
    logError("GET /api/positions/:tokenId failed", error);
    res.status(500).json({ error: "Failed to fetch position" });
  }
});

// ─── Agents (ERC-8004) ──────────────────────
app.get("/api/agents/count", async (_req, res) => {
  try {
    const count = await getTotalAgents();
    res.json({ count });
  } catch (error) {
    logError("GET /api/agents/count failed", error);
    res.status(500).json({ error: "Failed to fetch agent count" });
  }
});

app.get("/api/agents/all", async (_req, res) => {
  try {
    const count = await getTotalAgents();
    const agents = [];
    for (let i = 1; i <= count; i++) {
      try {
        const info = await contracts.identity.getAgent(i);
        const strategyIndex = Number(
          await contracts.agent.agentStrategy(info.agentAddress)
        );
        const authorized = await contracts.agent.authorizedAgents(
          info.agentAddress
        );
        agents.push({
          agentId: Number(info.agentId),
          domain: info.agentDomain,
          address: info.agentAddress,
          strategy: STRATEGY_MAP[strategyIndex] ?? "UNKNOWN",
          strategyConfig: STRATEGY_CONFIG[STRATEGY_MAP[strategyIndex]] ?? null,
          authorized,
        });
      } catch {
        // Skip agents that fail to load
      }
    }
    res.json({ agents });
  } catch (error) {
    logError("GET /api/agents/all failed", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

app.get("/api/agents/address/:address", async (req, res) => {
  try {
    const info = await contracts.identity.resolveByAddress(req.params.address);
    res.json({
      agentId: Number(info.agentId),
      domain: info.agentDomain,
      address: info.agentAddress,
    });
  } catch (error) {
    logError("GET /api/agents/address/:address failed", error);
    res.status(500).json({ error: "Agent not found" });
  }
});

app.get("/api/agents/:id/reputation", async (req, res) => {
  try {
    const agentId = Number(req.params.id);
    const reputation = await getAgentReputation(agentId);
    res.json(reputation);
  } catch (error) {
    logError("GET /api/agents/:id/reputation failed", error);
    res.status(500).json({ error: "Failed to fetch agent reputation" });
  }
});

app.get("/api/agents/:id", async (req, res) => {
  try {
    const agentId = Number(req.params.id);
    const info = await contracts.identity.getAgent(agentId);
    res.json({
      agentId: Number(info.agentId),
      domain: info.agentDomain,
      address: info.agentAddress,
    });
  } catch (error) {
    logError("GET /api/agents/:id failed", error);
    res.status(500).json({ error: "Agent not found" });
  }
});

// ─── Validation (ERC-8004) ───────────────────
app.get("/api/validation/:dataHash", async (req, res) => {
  try {
    const result = await getValidationStatus(req.params.dataHash);
    res.json(result);
  } catch (error) {
    logError("GET /api/validation/:dataHash failed", error);
    res.status(500).json({ error: "Failed to fetch validation status" });
  }
});

// ─── Strategies ──────────────────────────────
app.get("/api/strategies", (_req, res) => {
  res.json(STRATEGY_CONFIG);
});

// ─── Analyze (Pre-Deposit LLM Preview) ──────
const AGENT_ADDRESSES: Record<StrategyName, string> = {
  CONSERVATIVE: "0x5b6A404F8958E7e10028301549e61435925725Bf",
  BALANCED: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607",
  DEGEN: "0x5B20B5a4Bba73bC6363fBE90E6b2Ab4fFF5C820e",
};

app.post("/api/analyze", async (req, res) => {
  try {
    const { strategy } = req.body as { strategy?: string };

    if (!strategy || !STRATEGY_MAP.includes(strategy as StrategyName)) {
      res.status(400).json({
        error: "Invalid strategy. Must be CONSERVATIVE, BALANCED, or DEGEN",
      });
      return;
    }

    const strategyName = strategy as StrategyName;

    // Get live pool state
    const poolState = await getPoolState();
    const currentPrice = tickToPrice(poolState.tick);

    const analysis = {
      currentTick: poolState.tick,
      currentPrice,
      liquidity: poolState.liquidity.toString(),
      feeGrowth0: poolState.feeGrowthGlobal0.toString(),
      feeGrowth1: poolState.feeGrowthGlobal1.toString(),
    };

    // Ask Gemini what it would do for a new deposit (no existing positions)
    const decision = await analyzePoolWithGemini(analysis, strategyName, []);

    res.json({
      strategy: strategyName,
      strategyConfig: STRATEGY_CONFIG[strategyName],
      pool: {
        tick: poolState.tick,
        price: currentPrice,
        liquidity: poolState.liquidity.toString(),
      },
      recommendation: decision,
      agentAddress: AGENT_ADDRESSES[strategyName],
    });
  } catch (error) {
    logError("POST /api/analyze failed", error);
    res.status(500).json({ error: "Failed to analyze pool" });
  }
});

// ─── Assign Agent ──────
app.get("/api/assign/:depositId", async (req, res) => {
  try {
    const depositId = Number(req.params.depositId);
    const deposit = await getDepositInfo(depositId);

    if (deposit.status !== 0) {
      res.status(400).json({ error: "Deposit is not active" });
      return;
    }

    if (deposit.assignedAgent !== "0x0000000000000000000000000000000000000000") {
      res.json({
        depositId,
        alreadyAssigned: true,
        assignedAgent: deposit.assignedAgent,
      });
      return;
    }

    const strategyName = STRATEGY_MAP[deposit.strategy];
    const agentAddress = AGENT_ADDRESSES[strategyName];

    res.json({
      depositId,
      alreadyAssigned: false,
      strategy: strategyName,
      agentAddress,
      contractAddress: process.env.CLMM_LIQUIDITY_AGENT,
      calldata: {
        function: "assignAgent(uint256,address)",
        args: [depositId, agentAddress],
      },
    });
  } catch (error) {
    logError("GET /api/assign/:depositId failed", error);
    res.status(500).json({ error: "Failed to get agent assignment" });
  }
});

// ─── Rebalance ──────
app.post("/api/rebalance/:depositId", async (req, res) => {
  try {
    const depositId = Number(req.params.depositId);
    const deposit = await getDepositInfo(depositId);

    if (deposit.status !== 0) {
      res.status(400).json({ error: "Deposit is not active" });
      return;
    }

    const strategyName = STRATEGY_MAP[deposit.strategy];

    // Get current pool state
    const poolState = await getPoolState();
    const currentPrice = tickToPrice(poolState.tick);

    const analysis = {
      currentTick: poolState.tick,
      currentPrice,
      liquidity: poolState.liquidity.toString(),
      feeGrowth0: poolState.feeGrowthGlobal0.toString(),
      feeGrowth1: poolState.feeGrowthGlobal1.toString(),
    };

    log("REBALANCE", `Rebalancing deposit #${depositId} (${strategyName})...`);
    const decision = await analyzePoolWithGemini(analysis, strategyName, []);

    if (!decision.tickLower || !decision.tickUpper) {
      res.status(500).json({ error: "Gemini did not return tick range" });
      return;
    }

    // ERC-8004 validation: request before executing
    const agentInfo = await initAgent();
    let validationHash: string | null = null;
    try {
      validationHash = await requestValidation(
        agentInfo.agentId,
        agentInfo.agentId,
        { depositId, action: "REBALANCE", tickLower: decision.tickLower, tickUpper: decision.tickUpper, timestamp: Date.now() }
      );
    } catch (err) {
      logError("Validation request failed during rebalance", err);
    }

    // Execute: close all existing → mint new position
    const rebalanceResult = await executeRebalance(depositId, decision.tickLower, decision.tickUpper);

    // ERC-8004 validation: submit response after execution
    if (validationHash) {
      try {
        await submitValidationResponse(validationHash, Math.min(decision.confidence, 100));
      } catch (err) {
        logError("Validation response failed during rebalance", err);
      }
    }

    // Re-read deposit for updated state
    const updatedDeposit = await getDepositInfo(depositId);

    res.json(
      serialize({
        depositId,
        strategy: strategyName,
        action: "REBALANCE",
        previousPositions: deposit.positionTokenIds,
        newPosition: rebalanceResult.newTokenId ?? null,
        newTickLower: decision.tickLower,
        newTickUpper: decision.tickUpper,
        reason: decision.reason,
        confidence: decision.confidence,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
        },
        transactions: {
          close: rebalanceResult.closeTxHashes,
          mint: rebalanceResult.mintResult,
          validationHash,
        },
        updatedDeposit: {
          amount0Remaining: updatedDeposit.amount0Remaining,
          amount1Remaining: updatedDeposit.amount1Remaining,
          positionTokenIds: updatedDeposit.positionTokenIds,
        },
      })
    );
  } catch (error) {
    logError("POST /api/rebalance/:depositId failed", error);
    res.status(500).json({ error: "Failed to rebalance position" });
  }
});

// ─── Agent Run (Demo Mode) ──────────────────────
app.post("/api/agent/run", async (_req, res) => {
  try {
    log("AGENT", "Manual agent run triggered via API");
    const result = await runAgentOnce();
    res.json(serialize(result));
  } catch (error) {
    logError("POST /api/agent/run failed", error);
    res.status(500).json({ error: "Failed to run agent" });
  }
});

app.get("/api/agent/status", (_req, res) => {
  const info = getAgentInfo();
  if (!info) {
    res.json({ initialized: false, message: "Agent not initialized yet" });
    return;
  }
  res.json({
    initialized: true,
    agentId: info.agentId,
    domain: info.domain,
    address: info.address,
  });
});

// ─── Agent Run for Specific Deposit ──────────────────────

app.post("/api/agent/run/:depositId", async (req, res) => {
  try {
    const depositId = Number(req.params.depositId);
    
    if (isNaN(depositId) || depositId <= 0) {
      res.status(400).json({ error: "Invalid deposit ID" });
      return;
    }

    log("AGENT", `Manual agent run triggered for deposit #${depositId} via API`);
    const result = await runAgentForDeposit(depositId);
    res.json(serialize(result));
  } catch (error) {
    logError("POST /api/agent/run/:depositId failed", error);
    res.status(500).json({ error: "Failed to run agent for deposit" });
  }
});

// ─── Agent Close Positions ──────────────────────

app.post("/api/agent/close/:depositId", async (req, res) => {
  try {
    const depositId = Number(req.params.depositId);
    
    if (isNaN(depositId) || depositId <= 0) {
      res.status(400).json({ error: "Invalid deposit ID" });
      return;
    }

    log("CLOSE", `Close positions triggered for deposit #${depositId} via API`);
    const result = await closePositionsForDeposit(depositId);
    res.json(serialize(result));
  } catch (error) {
    logError("POST /api/agent/close/:depositId failed", error);
    res.status(500).json({ error: "Failed to close positions" });
  }
});

// Export for Vercel
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
