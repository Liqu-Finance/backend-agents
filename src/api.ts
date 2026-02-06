import express from "express";
import cors from "cors";
import { contracts, STRATEGY_CONFIG, POOL_PARAMS } from "./config";
import {
  getPoolState,
  getDepositInfo,
  getPositionInfo,
  getMyAssignedDeposits,
  tickToPrice,
} from "./pool-reader";
import { getTotalAgents, getValidationStatus, getAgentReputation } from "./erc8004-service";
import { analyzePoolWithGemini } from "./gemini-analyzer";
import { executeRebalance } from "./tx-executor";
import { STRATEGY_MAP, StrategyName } from "./types";
import { log, logError } from "./logger";
import { getRecentDeposits } from "./event-listener";
import { setupSwagger } from "./swagger";

// BigInt-safe JSON serializer
function serialize(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export const app = express();
app.use(cors());
app.use(express.json());

// Setup Swagger documentation
setupSwagger(app);

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

// ─── Assign Agent (returns correct agent for a deposit) ──────

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
      // Frontend should call: CLMMLiquidityAgent.assignAgent(depositId, agentAddress)
      // from the user's wallet (msg.sender must be the depositor)
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

// ─── Rebalance (Demo: close all positions + re-mint with new range) ──────

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

    // Ask Gemini for new optimal tick range (pass empty positions so it always suggests MINT)
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

    // Execute: close all existing → mint new position
    const newTokenId = await executeRebalance(depositId, decision.tickLower, decision.tickUpper);

    // Re-read deposit for updated state
    const updatedDeposit = await getDepositInfo(depositId);

    res.json(
      serialize({
        depositId,
        strategy: strategyName,
        action: "REBALANCE",
        previousPositions: deposit.positionTokenIds,
        newPosition: newTokenId ?? null,
        newTickLower: decision.tickLower,
        newTickUpper: decision.tickUpper,
        reason: decision.reason,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
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

// ─── Recent Deposits (from event listener) ──────

app.get("/api/deposits/recent", (_req, res) => {
  res.json({ deposits: getRecentDeposits() });
});
