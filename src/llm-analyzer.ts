import dotenv from "dotenv";
import { PoolAnalysis, PositionDecision, StrategyName } from "./types";
import { analyzePoolWithGemini } from "./gemini-analyzer";
import { analyzePoolWithOpenAI } from "./openai-analyzer";
import { analyzePoolWithKimi } from "./kimi-analyzer";
import { STRATEGY_CONFIG } from "./config";
import { log, logError } from "./logger";

dotenv.config();

type LLMProvider = "openai" | "gemini" | "kimi";

const LLM_PROVIDER: LLMProvider = (process.env.LLM_PROVIDER as LLMProvider) || "gemini";

// Fallback function for when LLM fails (hardcoded for hackathon demo)
function getFallbackDecision(
  poolState: PoolAnalysis,
  strategy: StrategyName,
  existingPositions: { tickLower: number; tickUpper: number; liquidity: string }[],
): PositionDecision {
  const config = STRATEGY_CONFIG[strategy];
  const currentTick = poolState.currentTick;
  const tickSpacing = 60;
  
  // Calculate tick range based on strategy multiplier
  const tickRange = config.tickRangeMultiplier * tickSpacing;
  
  // Align to tick spacing
  const alignTick = (tick: number) => Math.floor(tick / tickSpacing) * tickSpacing;
  
  const tickLower = alignTick(currentTick - tickRange);
  const tickUpper = alignTick(currentTick + tickRange);

  // If no positions exist, MINT new position
  if (existingPositions.length === 0) {
    log("AGENT", `[FALLBACK] No positions - recommending MINT with range [${tickLower}, ${tickUpper}]`);
    return {
      action: "MINT",
      tickLower,
      tickUpper,
      reason: "[Fallback] LLM unavailable - auto-minting based on strategy config",
      confidence: 75,
    };
  }

  // Check if existing positions are out of range
  const hasOutOfRangePosition = existingPositions.some((pos) => {
    const posCenter = (pos.tickLower + pos.tickUpper) / 2;
    const distanceFromCenter = Math.abs(currentTick - posCenter);
    const posRange = (pos.tickUpper - pos.tickLower) / 2;
    const outOfRangeThreshold = posRange * config.rebalanceThreshold;
    return distanceFromCenter > outOfRangeThreshold;
  });

  if (hasOutOfRangePosition) {
    log("AGENT", `[FALLBACK] Position out of range - recommending REBALANCE to [${tickLower}, ${tickUpper}]`);
    return {
      action: "REBALANCE",
      tickLower,
      tickUpper,
      reason: "[Fallback] LLM unavailable - auto-rebalancing out-of-range position",
      confidence: 70,
    };
  }

  // Default: HOLD
  log("AGENT", `[FALLBACK] Positions in range - recommending HOLD`);
  return {
    action: "HOLD",
    reason: "[Fallback] LLM unavailable - positions appear in range",
    confidence: 60,
  };
}

export async function analyzePool(
  poolState: PoolAnalysis,
  strategy: StrategyName,
  existingPositions: { tickLower: number; tickUpper: number; liquidity: string }[],
): Promise<PositionDecision> {
  log("AGENT", `Using LLM provider: ${LLM_PROVIDER.toUpperCase()}`);

  try {
    let decision: PositionDecision;
    
    switch (LLM_PROVIDER) {
      case "openai":
        decision = await analyzePoolWithOpenAI(poolState, strategy, existingPositions);
        break;
      case "kimi":
        decision = await analyzePoolWithKimi(poolState, strategy, existingPositions);
        break;
      case "gemini":
      default:
        decision = await analyzePoolWithGemini(poolState, strategy, existingPositions);
        break;
    }

    // If LLM returned low confidence (likely parse error), use fallback
    if (decision.confidence === 0 || decision.reason?.includes("Failed to parse")) {
      log("AGENT", `LLM returned low confidence or parse error - using fallback`);
      return getFallbackDecision(poolState, strategy, existingPositions);
    }

    return decision;
  } catch (error) {
    logError("LLM analysis failed, using fallback decision", error);
    return getFallbackDecision(poolState, strategy, existingPositions);
  }
}
