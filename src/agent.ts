import { agentWallet } from "./config";
import {
  getPoolState,
  getDepositInfo,
  getPositionInfo,
  getMyAssignedDeposits,
  tickToPrice,
} from "./pool-reader";
import { analyzePoolWithGemini } from "./gemini-analyzer";
import { executeDecision, getCachedPositionTicks } from "./tx-executor";
import { getMyAgentInfo, requestValidation, submitValidationResponse } from "./erc8004-service";
import { PoolAnalysis, PositionDecision, STRATEGY_MAP, AgentInfo } from "./types";
import { log, logError } from "./logger";

const CHECK_INTERVAL = 60_000; // 1 minute

let agentInfo: AgentInfo | null = null;

export function getAgentInfo(): AgentInfo | null {
  return agentInfo;
}

// Process a single deposit — called by both the loop and the event listener
export async function processDeposit(depositId: number): Promise<void> {
  const info = agentInfo;
  if (!info) {
    logError("Agent not initialized yet, skipping deposit", undefined);
    return;
  }

  const deposit = await getDepositInfo(depositId);
  const strategy = STRATEGY_MAP[deposit.strategy];

  // Verify this deposit is assigned to us and active
  if (deposit.assignedAgent.toLowerCase() !== agentWallet.address.toLowerCase()) {
    log("SKIP", `Deposit #${depositId} not assigned to us`);
    return;
  }
  if (deposit.status !== 0) {
    log("SKIP", `Deposit #${depositId} is not active (status=${deposit.status})`);
    return;
  }

  log("AGENT", `\n[DEPOSIT #${depositId}] strategy=${strategy}, status=${deposit.status}`);
  log("AGENT", `  amount0Remaining=${deposit.amount0Remaining.toString()}`);
  log("AGENT", `  amount1Remaining=${deposit.amount1Remaining.toString()}`);
  log("AGENT", `  positions: [${deposit.positionTokenIds.join(", ")}]`);

  // Get existing position details — use cached ticks since router returns 0,0
  const existingPositions = [];
  for (const tokenId of deposit.positionTokenIds) {
    const pos = await getPositionInfo(tokenId);
    const cached = getCachedPositionTicks(tokenId);
    existingPositions.push({
      tickLower: cached?.tickLower ?? pos.tickLower,
      tickUpper: cached?.tickUpper ?? pos.tickUpper,
      liquidity: pos.liquidity.toString(),
    });
  }

  // Read pool state
  const poolState = await getPoolState();
  const currentPrice = tickToPrice(poolState.tick);

  // If positions already exist with liquidity and we don't have cached ticks,
  // assume they are in-range and HOLD to avoid infinite minting
  if (existingPositions.length > 0) {
    const hasUnknownPositions = existingPositions.some(
      (p) => p.tickLower === 0 && p.tickUpper === 0 && p.liquidity !== "0"
    );
    if (hasUnknownPositions) {
      log("HOLD", `Deposit #${depositId} has ${existingPositions.length} position(s) with unknown tick range — holding`);
      return;
    }
  }

  const analysis: PoolAnalysis = {
    currentTick: poolState.tick,
    currentPrice,
    liquidity: poolState.liquidity.toString(),
    feeGrowth0: poolState.feeGrowthGlobal0.toString(),
    feeGrowth1: poolState.feeGrowthGlobal1.toString(),
  };

  log("GEMINI", `Analyzing pool for ${strategy} strategy...`);
  const decision: PositionDecision = await analyzePoolWithGemini(
    analysis,
    strategy,
    existingPositions
  );

  log("GEMINI", `Decision: ${decision.action} (confidence=${decision.confidence}%)`);
  log("GEMINI", `Reason: ${decision.reason}`);

  // Only execute if confidence is high enough
  if (decision.confidence < 60) {
    log("SKIP", `Confidence too low (${decision.confidence}%), holding`);
    return;
  }

  // Request on-chain validation before executing
  let dataHash: string | null = null;
  if (decision.action !== "HOLD") {
    try {
      dataHash = await requestValidation(
        info.agentId,
        info.agentId,
        { depositId, decision, timestamp: Date.now() }
      );
      log("ERC-8004", `Validation requested: ${dataHash}`);
    } catch (error) {
      logError("Validation request failed, continuing with execution", error);
    }
  }

  // Execute the decision
  await executeDecision(depositId, decision);

  // Submit validation response (self-validate with confidence as score)
  if (dataHash) {
    try {
      const score = Math.min(decision.confidence, 100);
      await submitValidationResponse(dataHash, score);
      log("ERC-8004", `Validation response submitted: score=${score}`);
    } catch (error) {
      logError("Validation response failed", error);
    }
  }
}

// Initialize the agent identity (call once on startup)
export async function initAgent(): Promise<AgentInfo> {
  if (!agentInfo) {
    agentInfo = await getMyAgentInfo();
    log("AGENT", `Agent initialized: ${agentInfo.domain} (id=${agentInfo.agentId})`);
    log("AGENT", `Address: ${agentInfo.address}`);
  }
  return agentInfo;
}

// Result of a single agent run
export interface AgentRunResult {
  agentId: number;
  agentDomain: string;
  agentAddress: string;
  pool: {
    tick: number;
    price: number;
    liquidity: string;
  };
  depositsProcessed: number;
  depositResults: {
    depositId: number;
    status: "processed" | "skipped" | "error";
    message: string;
  }[];
  timestamp: number;
}

// Run agent logic once (for demo/API usage)
export async function runAgentOnce(): Promise<AgentRunResult> {
  // 1. Verify our identity on-chain
  const info = await initAgent();
  log("AGENT", `Running agent once: ${info.domain} (id=${info.agentId})`);

  const depositResults: AgentRunResult["depositResults"] = [];

  try {
    // 2. Read pool state
    const poolState = await getPoolState();
    const currentPrice = tickToPrice(poolState.tick);

    log("POOL", `tick=${poolState.tick}, price=${currentPrice.toFixed(2)} USDT/WETH`);
    log("POOL", `liquidity=${poolState.liquidity.toString()}`);

    // 3. Find deposits assigned to us
    const myDeposits = await getMyAssignedDeposits(agentWallet.address);
    log("AGENT", `Managing ${myDeposits.length} deposit(s)`);

    for (const depositId of myDeposits) {
      try {
        await processDeposit(depositId);
        depositResults.push({
          depositId,
          status: "processed",
          message: `Deposit #${depositId} processed successfully`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Failed to process deposit #${depositId}`, error);
        depositResults.push({
          depositId,
          status: "error",
          message: errorMessage,
        });
      }
    }

    log("AGENT", `Agent run complete. Processed ${myDeposits.length} deposit(s).`);

    return {
      agentId: info.agentId,
      agentDomain: info.domain,
      agentAddress: info.address,
      pool: {
        tick: poolState.tick,
        price: currentPrice,
        liquidity: poolState.liquidity.toString(),
      },
      depositsProcessed: myDeposits.length,
      depositResults,
      timestamp: Date.now(),
    };
  } catch (error) {
    logError("Agent run error", error);
    throw error;
  }
}

export async function runAgentLoop(): Promise<void> {
  // 1. Verify our identity on-chain
  agentInfo = await getMyAgentInfo();
  log("AGENT", `Starting agent: ${agentInfo.domain} (id=${agentInfo.agentId})`);
  log("AGENT", `Address: ${agentInfo.address}`);
  log("AGENT", "Strategy: checking assigned deposits...\n");

  while (true) {
    try {
      // 2. Read pool state
      const poolState = await getPoolState();
      const currentPrice = tickToPrice(poolState.tick);

      log("POOL", `tick=${poolState.tick}, price=${currentPrice.toFixed(2)} USDT/WETH`);
      log("POOL", `liquidity=${poolState.liquidity.toString()}`);

      // 3. Find deposits assigned to us
      const myDeposits = await getMyAssignedDeposits(agentWallet.address);
      log("AGENT", `Managing ${myDeposits.length} deposit(s)`);

      for (const depositId of myDeposits) {
        try {
          await processDeposit(depositId);
        } catch (error) {
          logError(`Failed to process deposit #${depositId}`, error);
        }
      }
    } catch (error) {
      logError("Agent loop error", error);
    }

    log("AGENT", `Sleeping ${CHECK_INTERVAL / 1000}s...\n`);
    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
  }
}
