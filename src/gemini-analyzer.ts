import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { STRATEGY_CONFIG } from "./config";
import { PoolAnalysis, PositionDecision, StrategyName } from "./types";
import { log, logError } from "./logger";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function alignTick(tick: number, spacing: number = 60): number {
  return Math.floor(tick / spacing) * spacing;
}

export async function analyzePoolWithGemini(
  poolState: PoolAnalysis,
  strategy: StrategyName,
  existingPositions: { tickLower: number; tickUpper: number; liquidity: string }[],
): Promise<PositionDecision> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const config = STRATEGY_CONFIG[strategy];

  const prompt = `You are a DeFi CLMM (Concentrated Liquidity Market Maker) analysis agent for Uniswap V4.

POOL STATE:
- Current tick: ${poolState.currentTick}
- Current price (WETH/USDT): ${poolState.currentPrice}
- Total liquidity: ${poolState.liquidity}
- Fee growth token0: ${poolState.feeGrowth0}
- Fee growth token1: ${poolState.feeGrowth1}
- Pool: USDT/WETH, fee=0.3%, tickSpacing=60

STRATEGY: ${strategy}
- ${config.description}
- Tick range multiplier: ${config.tickRangeMultiplier} (range = ±${config.tickRangeMultiplier * 60} ticks)
- Max slippage: ${config.maxSlippage * 100}%
- Rebalance threshold: ${config.rebalanceThreshold * 100}%

EXISTING POSITIONS:
${existingPositions.length === 0 ? "None — no positions open yet" : existingPositions.map((p, i) => `  Position ${i + 1}: tickLower=${p.tickLower}, tickUpper=${p.tickUpper}, liquidity=${p.liquidity}`).join("\n")}

RULES:
- tickLower and tickUpper MUST be multiples of 60 (tickSpacing)
- tickLower < currentTick < tickUpper for in-range positions
- For ${strategy} strategy, recommended range: currentTick ± ${config.tickRangeMultiplier * 60}
- If existing position is more than ${config.rebalanceThreshold * 100}% out of range, close and re-mint

Respond in this exact JSON format only (no markdown, no explanation outside JSON):
{
  "action": "MINT" | "CLOSE" | "HOLD",
  "tickLower": <number or null>,
  "tickUpper": <number or null>,
  "reason": "<brief explanation>",
  "confidence": <0-100>
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const jsonStr = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const decision: PositionDecision = JSON.parse(jsonStr);

    // Align ticks to multiples of 60
    if (decision.tickLower != null) {
      decision.tickLower = alignTick(decision.tickLower);
    }
    if (decision.tickUpper != null) {
      decision.tickUpper = alignTick(decision.tickUpper);
    }

    // Validate tick ordering
    if (decision.tickLower != null && decision.tickUpper != null && decision.tickLower >= decision.tickUpper) {
      const temp = decision.tickLower;
      decision.tickLower = decision.tickUpper;
      decision.tickUpper = temp;
    }

    return decision;
  } catch (error) {
    logError("Failed to parse Gemini response", error);
    return {
      action: "HOLD",
      reason: "Failed to parse LLM response",
      confidence: 0,
    };
  }
}
