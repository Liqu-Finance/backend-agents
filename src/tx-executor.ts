import { contracts } from "./config";
import { getDepositInfo, getPoolState } from "./pool-reader";
import { PositionDecision } from "./types";
import { log, logError } from "./logger";

// ─── Result types (tx hashes for frontend) ──────────────────────

export interface MintResult {
  tokenId: number | undefined;
  txHash: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface CloseResult {
  tokenId: number;
  txHash: string;
}

export interface RebalanceResult {
  closeTxHashes: CloseResult[];
  mintResult: MintResult | null;
  newTokenId: number | undefined;
}

// Track minted tick ranges in-memory (router contract doesn't return them)
const positionTickCache = new Map<number, { tickLower: number; tickUpper: number }>();

export function getCachedPositionTicks(tokenId: number): { tickLower: number; tickUpper: number } | undefined {
  return positionTickCache.get(tokenId);
}

// ─── Uniswap V3/V4 liquidity math (pure BigInt) ─────────────────

const Q96 = 1n << 96n;

function tickToSqrtPriceX96(tick: number): bigint {
  // Uses the same math as TickMath.getSqrtPriceAtTick
  // sqrtPrice = sqrt(1.0001^tick) * 2^96
  const absTick = Math.abs(tick);
  let ratio = (absTick & 0x1) !== 0 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;

  // Convert from Q128 to Q96
  return (ratio >> 32n) + (ratio % (1n << 32n) > 0n ? 1n : 0n);
}

function getLiquidityForAmounts(sqrtPriceX96: bigint, sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, amount0: bigint, amount1: bigint): bigint {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }

  if (sqrtPriceX96 <= sqrtPriceAX96) {
    // Current price below range — only token0 is used
    return getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
  } else if (sqrtPriceX96 < sqrtPriceBX96) {
    // Current price in range — use both tokens, take the min liquidity
    const liq0 = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
    const liq1 = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
    return liq0 < liq1 ? liq0 : liq1;
  } else {
    // Current price above range — only token1 is used
    return getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
  }
}

function getLiquidityForAmount0(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, amount0: bigint): bigint {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }
  const intermediate = (sqrtPriceAX96 * sqrtPriceBX96) / Q96;
  return (amount0 * intermediate) / (sqrtPriceBX96 - sqrtPriceAX96);
}

function getLiquidityForAmount1(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, amount1: bigint): bigint {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }
  return (amount1 * Q96) / (sqrtPriceBX96 - sqrtPriceAX96);
}

// ─── End liquidity math ──────────────────────────────────────────

export async function executeMintPosition(
  depositId: number,
  tickLower: number,
  tickUpper: number,
  amount0Max: bigint,
  amount1Max: bigint,
): Promise<MintResult | undefined> {
  const deadline = Math.floor(Date.now() / 1000) + 300;

  // Calculate optimal liquidity from available amounts and current pool price
  const poolState = await getPoolState();
  const sqrtPriceCurrent = BigInt(poolState.sqrtPriceX96.toString());
  const sqrtPriceA = tickToSqrtPriceX96(tickLower);
  const sqrtPriceB = tickToSqrtPriceX96(tickUpper);

  let liquidity = getLiquidityForAmounts(sqrtPriceCurrent, sqrtPriceA, sqrtPriceB, amount0Max, amount1Max);

  // Apply 1% safety margin to avoid rounding-related reverts
  liquidity = (liquidity * 99n) / 100n;

  if (liquidity === 0n) {
    log("SKIP", "Calculated liquidity is 0, skipping mint");
    return undefined;
  }

  log("TX", `Calculated liquidity=${liquidity.toString()}`);

  log("TX", `Minting position for deposit ${depositId}`);
  log("TX", `  tickLower=${tickLower}, tickUpper=${tickUpper}`);
  log("TX", `  amount0Max=${amount0Max.toString()}, amount1Max=${amount1Max.toString()}`);

  const tx = await contracts.agent.agentMintPosition(depositId, tickLower, tickUpper, liquidity, amount0Max, amount1Max, deadline);

  const receipt = await tx.wait();
  const txHash = receipt.hash;
  log("TX", `Minted! txHash=${txHash}`);

  // Parse PositionCreated event
  let tokenId: number | undefined;
  const iface = contracts.agent.interface;
  for (const txLog of receipt.logs) {
    try {
      const parsed = iface.parseLog({
        topics: txLog.topics as string[],
        data: txLog.data,
      });
      if (parsed?.name === "PositionCreated") {
        tokenId = Number(parsed.args.tokenId);
        log("TX", `Position tokenId=${tokenId}`);
        positionTickCache.set(tokenId, { tickLower, tickUpper });
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  return {
    tokenId,
    txHash,
    liquidity: liquidity.toString(),
    amount0: amount0Max.toString(),
    amount1: amount1Max.toString(),
  };
}

export async function executeClosePosition(depositId: number, tokenId: number): Promise<CloseResult> {
  const deadline = Math.floor(Date.now() / 1000) + 300;

  log("TX", `Closing position tokenId=${tokenId} for deposit ${depositId}`);

  const tx = await contracts.agent.agentClosePosition(depositId, tokenId, 0, 0, deadline);

  const receipt = await tx.wait();
  const txHash = receipt.hash;
  log("TX", `Closed! txHash=${txHash}`);

  // Remove from cache
  positionTickCache.delete(tokenId);

  return { tokenId, txHash };
}

export async function executeRebalance(
  depositId: number,
  newTickLower: number,
  newTickUpper: number,
): Promise<RebalanceResult> {
  const closeTxHashes: CloseResult[] = [];

  // Step 1: Close all existing positions
  let deposit = await getDepositInfo(depositId);

  if (deposit.positionTokenIds.length === 0) {
    log("REBALANCE", `No positions to close for deposit #${depositId}, skipping close step`);
  } else {
    log("REBALANCE", `Closing ${deposit.positionTokenIds.length} position(s) for deposit #${depositId}...`);
    for (const tokenId of deposit.positionTokenIds) {
      const closeResult = await executeClosePosition(depositId, tokenId);
      closeTxHashes.push(closeResult);
    }
    log("REBALANCE", `All positions closed. Tokens returned to deposit.`);
  }

  // Step 2: Re-read deposit to get updated balances after close
  deposit = await getDepositInfo(depositId);
  const amount0Max = deposit.amount0Remaining;
  const amount1Max = deposit.amount1Remaining;

  if (amount0Max === 0n && amount1Max === 0n) {
    log("REBALANCE", "No remaining balance after close, cannot re-mint");
    return { closeTxHashes, mintResult: null, newTokenId: undefined };
  }

  log("REBALANCE", `Re-minting with new range: tickLower=${newTickLower}, tickUpper=${newTickUpper}`);
  log("REBALANCE", `  amount0=${amount0Max.toString()}, amount1=${amount1Max.toString()}`);

  // Step 3: Mint new position with new tick range
  const mintResult = await executeMintPosition(depositId, newTickLower, newTickUpper, amount0Max, amount1Max);

  if (mintResult?.tokenId) {
    log("REBALANCE", `Rebalance complete! New position tokenId=${mintResult.tokenId}`);
  }

  return {
    closeTxHashes,
    mintResult: mintResult ?? null,
    newTokenId: mintResult?.tokenId,
  };
}

// Execution result with all tx hashes
export interface ExecutionResult {
  action: string;
  txHashes: string[];
  newTokenId?: number;
  tickLower?: number;
  tickUpper?: number;
}

export async function executeDecision(depositId: number, decision: PositionDecision): Promise<ExecutionResult> {
  const deposit = await getDepositInfo(depositId);
  const txHashes: string[] = [];

  if (decision.action === "MINT" && decision.tickLower != null && decision.tickUpper != null) {
    const amount0Max = deposit.amount0Remaining;
    const amount1Max = deposit.amount1Remaining;

    if (amount0Max === 0n && amount1Max === 0n) {
      log("SKIP", "No remaining balance to mint");
      return { action: "SKIP", txHashes: [], tickLower: decision.tickLower, tickUpper: decision.tickUpper };
    }

    const mintResult = await executeMintPosition(depositId, decision.tickLower, decision.tickUpper, amount0Max, amount1Max);
    if (mintResult) {
      txHashes.push(mintResult.txHash);
      return { 
        action: "MINT", 
        txHashes, 
        newTokenId: mintResult.tokenId,
        tickLower: decision.tickLower,
        tickUpper: decision.tickUpper 
      };
    }
    return { action: "SKIP", txHashes: [], tickLower: decision.tickLower, tickUpper: decision.tickUpper };
  }

  if (decision.action === "CLOSE") {
    for (const tokenId of deposit.positionTokenIds) {
      const closeResult = await executeClosePosition(depositId, tokenId);
      txHashes.push(closeResult.txHash);
    }
    return { action: "CLOSE", txHashes };
  }

  if (decision.action === "REBALANCE" && decision.tickLower != null && decision.tickUpper != null) {
    const rebalanceResult = await executeRebalance(depositId, decision.tickLower, decision.tickUpper);
    
    // Collect all tx hashes from close operations
    for (const closeResult of rebalanceResult.closeTxHashes) {
      txHashes.push(closeResult.txHash);
    }
    
    // Add mint tx hash if present
    if (rebalanceResult.mintResult) {
      txHashes.push(rebalanceResult.mintResult.txHash);
    }
    
    return { 
      action: "REBALANCE", 
      txHashes, 
      newTokenId: rebalanceResult.newTokenId,
      tickLower: decision.tickLower,
      tickUpper: decision.tickUpper 
    };
  }

  if (decision.action === "HOLD") {
    log("HOLD", decision.reason);
    return { action: "HOLD", txHashes: [] };
  }

  return { action: decision.action, txHashes: [] };
}
