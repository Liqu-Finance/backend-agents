import { agentWallet } from "./config";
import {
  getPoolState,
  getDepositInfo,
  getPositionInfo,
  getMyAssignedDeposits,
  tickToPrice,
} from "./pool-reader";
import { analyzePool } from "./llm-analyzer";
import { executeDecision, getCachedPositionTicks, ExecutionResult, executeClosePosition, CloseResult } from "./tx-executor";
import { getMyAgentInfo, requestValidation, submitValidationResponse } from "./erc8004-service";
import { PoolAnalysis, PositionDecision, STRATEGY_MAP, AgentInfo } from "./types";
import { log, logError } from "./logger";

const CHECK_INTERVAL = 60_000; // 1 minute

let agentInfo: AgentInfo | null = null;

export function getAgentInfo(): AgentInfo | null {
  return agentInfo;
}

// Result from processing a deposit (includes tx hashes)
export interface ProcessDepositResult {
  action: string;
  tickLower?: number;
  tickUpper?: number;
  newTokenId?: number;
  reason: string;
  confidence: number;
  txHashes: string[];
  validationHash?: string;
}

// Process a single deposit — called by both the loop and the event listener
export async function processDeposit(depositId: number): Promise<ProcessDepositResult | null> {
  const info = agentInfo;
  if (!info) {
    logError("Agent not initialized yet, skipping deposit", undefined);
    return null;
  }

  const deposit = await getDepositInfo(depositId);
  const strategy = STRATEGY_MAP[deposit.strategy];

  // Verify this deposit is assigned to us and active
  if (deposit.assignedAgent.toLowerCase() !== agentWallet.address.toLowerCase()) {
    log("SKIP", `Deposit #${depositId} not assigned to us`);
    return null;
  }
  if (deposit.status !== 0) {
    log("SKIP", `Deposit #${depositId} is not active (status=${deposit.status})`);
    return null;
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
      return {
        action: "HOLD",
        reason: "Position has unknown tick range",
        confidence: 100,
        txHashes: [],
      };
    }
  }

  const analysis: PoolAnalysis = {
    currentTick: poolState.tick,
    currentPrice,
    liquidity: poolState.liquidity.toString(),
    feeGrowth0: poolState.feeGrowthGlobal0.toString(),
    feeGrowth1: poolState.feeGrowthGlobal1.toString(),
  };

  log("AGENT", `Analyzing pool for ${strategy} strategy...`);
  const decision: PositionDecision = await analyzePool(
    analysis,
    strategy,
    existingPositions
  );

  log("AGENT", `Decision: ${decision.action} (confidence=${decision.confidence}%)`);
  log("AGENT", `Reason: ${decision.reason}`);

  // Note: Low confidence fallback is now handled in llm-analyzer.ts
  // so we proceed with execution directly

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
  const execResult = await executeDecision(depositId, decision);

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

  return {
    action: execResult.action,
    tickLower: execResult.tickLower,
    tickUpper: execResult.tickUpper,
    newTokenId: execResult.newTokenId,
    reason: decision.reason,
    confidence: decision.confidence,
    txHashes: execResult.txHashes,
    validationHash: dataHash ?? undefined,
  };
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

// Result for single deposit run
export interface SingleDepositRunResult {
  agentId: number;
  agentDomain: string;
  agentAddress: string;
  depositId: number;
  pool: {
    tick: number;
    price: number;
    liquidity: string;
  };
  status: "processed" | "skipped" | "error";
  action?: string;
  tickLower?: number;
  tickUpper?: number;
  newTokenId?: number;
  reason?: string;
  confidence?: number;
  txHashes?: string[];
  validationHash?: string;
  message: string;
  timestamp: number;
}

// Result for close positions operation
export interface ClosePositionsResult {
  agentId: number;
  agentDomain: string;
  agentAddress: string;
  depositId: number;
  pool: {
    tick: number;
    price: number;
    liquidity: string;
  };
  status: "success" | "error" | "no_positions";
  positionsClosed: number;
  closedTokenIds: number[];
  txHashes: string[];
  message: string;
  timestamp: number;
}

// Close all positions for a specific deposit
export async function closePositionsForDeposit(depositId: number): Promise<ClosePositionsResult> {
  // 1. Verify our identity on-chain
  const info = await initAgent();
  log("AGENT", `Closing positions for deposit #${depositId}: ${info.domain} (id=${info.agentId})`);

  try {
    // 2. Read pool state
    const poolState = await getPoolState();
    const currentPrice = tickToPrice(poolState.tick);

    log("POOL", `tick=${poolState.tick}, price=${currentPrice.toFixed(2)} USDT/WETH`);

    // 3. Verify deposit is assigned to us
    const myDeposits = await getMyAssignedDeposits(agentWallet.address);
    if (!myDeposits.includes(depositId)) {
      return {
        agentId: info.agentId,
        agentDomain: info.domain,
        agentAddress: info.address,
        depositId,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
          liquidity: poolState.liquidity.toString(),
        },
        status: "error",
        positionsClosed: 0,
        closedTokenIds: [],
        txHashes: [],
        message: `Deposit #${depositId} is not assigned to this agent`,
        timestamp: Date.now(),
      };
    }

    // 4. Get deposit info
    const deposit = await getDepositInfo(depositId);
    
    if (deposit.positionTokenIds.length === 0) {
      return {
        agentId: info.agentId,
        agentDomain: info.domain,
        agentAddress: info.address,
        depositId,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
          liquidity: poolState.liquidity.toString(),
        },
        status: "no_positions",
        positionsClosed: 0,
        closedTokenIds: [],
        txHashes: [],
        message: `Deposit #${depositId} has no positions to close`,
        timestamp: Date.now(),
      };
    }

    // 5. Close all positions
    const txHashes: string[] = [];
    const closedTokenIds: number[] = [];

    log("CLOSE", `Closing ${deposit.positionTokenIds.length} position(s) for deposit #${depositId}...`);

    for (const tokenId of deposit.positionTokenIds) {
      try {
        const closeResult = await executeClosePosition(depositId, tokenId);
        txHashes.push(closeResult.txHash);
        closedTokenIds.push(tokenId);
        log("CLOSE", `Position ${tokenId} closed: ${closeResult.txHash}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Failed to close position ${tokenId}`, error);
        
        return {
          agentId: info.agentId,
          agentDomain: info.domain,
          agentAddress: info.address,
          depositId,
          pool: {
            tick: poolState.tick,
            price: currentPrice,
            liquidity: poolState.liquidity.toString(),
          },
          status: "error",
          positionsClosed: closedTokenIds.length,
          closedTokenIds,
          txHashes,
          message: `Failed to close position ${tokenId}: ${errorMessage}`,
          timestamp: Date.now(),
        };
      }
    }

    log("CLOSE", `All ${closedTokenIds.length} position(s) closed successfully`);

    return {
      agentId: info.agentId,
      agentDomain: info.domain,
      agentAddress: info.address,
      depositId,
      pool: {
        tick: poolState.tick,
        price: currentPrice,
        liquidity: poolState.liquidity.toString(),
      },
      status: "success",
      positionsClosed: closedTokenIds.length,
      closedTokenIds,
      txHashes,
      message: `Successfully closed ${closedTokenIds.length} position(s) for deposit #${depositId}`,
      timestamp: Date.now(),
    };
  } catch (error) {
    logError("Close positions error", error);
    throw error;
  }
}

// Run agent for a specific deposit ID
export async function runAgentForDeposit(depositId: number): Promise<SingleDepositRunResult> {
  // 1. Verify our identity on-chain
  const info = await initAgent();
  log("AGENT", `Running agent for deposit #${depositId}: ${info.domain} (id=${info.agentId})`);

  try {
    // 2. Read pool state
    const poolState = await getPoolState();
    const currentPrice = tickToPrice(poolState.tick);

    log("POOL", `tick=${poolState.tick}, price=${currentPrice.toFixed(2)} USDT/WETH`);
    log("POOL", `liquidity=${poolState.liquidity.toString()}`);

    // 3. Verify deposit is assigned to us
    const myDeposits = await getMyAssignedDeposits(agentWallet.address);
    if (!myDeposits.includes(depositId)) {
      return {
        agentId: info.agentId,
        agentDomain: info.domain,
        agentAddress: info.address,
        depositId,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
          liquidity: poolState.liquidity.toString(),
        },
        status: "error",
        message: `Deposit #${depositId} is not assigned to this agent`,
        timestamp: Date.now(),
      };
    }

    // 4. Process the deposit
    try {
      const result = await processDeposit(depositId);
      
      if (!result) {
        return {
          agentId: info.agentId,
          agentDomain: info.domain,
          agentAddress: info.address,
          depositId,
          pool: {
            tick: poolState.tick,
            price: currentPrice,
            liquidity: poolState.liquidity.toString(),
          },
          status: "skipped",
          message: `Deposit #${depositId} was skipped`,
          timestamp: Date.now(),
        };
      }

      log("AGENT", `Deposit #${depositId} processed successfully`);

      return {
        agentId: info.agentId,
        agentDomain: info.domain,
        agentAddress: info.address,
        depositId,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
          liquidity: poolState.liquidity.toString(),
        },
        status: "processed",
        action: result.action,
        tickLower: result.tickLower,
        tickUpper: result.tickUpper,
        newTokenId: result.newTokenId,
        reason: result.reason,
        confidence: result.confidence,
        txHashes: result.txHashes,
        validationHash: result.validationHash,
        message: `Deposit #${depositId} processed successfully`,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Failed to process deposit #${depositId}`, error);

      return {
        agentId: info.agentId,
        agentDomain: info.domain,
        agentAddress: info.address,
        depositId,
        pool: {
          tick: poolState.tick,
          price: currentPrice,
          liquidity: poolState.liquidity.toString(),
        },
        status: "error",
        message: errorMessage,
        timestamp: Date.now(),
      };
    }
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
