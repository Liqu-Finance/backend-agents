import OpenAI from "openai";
import dotenv from "dotenv";
import { STRATEGY_CONFIG } from "./config";
import { PoolAnalysis, PositionDecision, StrategyName } from "./types";
import { log, logError } from "./logger";

dotenv.config();

// Kimi uses OpenAI-compatible API
const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY!,
  baseURL: "https://api.moonshot.cn/v1",
});

// Kimi configuration from environment
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.5";
const KIMI_TEMPERATURE = parseFloat(process.env.KIMI_TEMPERATURE || "0.7");
const KIMI_MAX_TOKENS = parseInt(process.env.KIMI_MAX_TOKENS || "1000", 10);

function alignTick(tick: number, spacing: number = 60): number {
  return Math.floor(tick / spacing) * spacing;
}

export async function analyzePoolWithKimi(
  poolState: PoolAnalysis,
  strategy: StrategyName,
  existingPositions: { tickLower: number; tickUpper: number; liquidity: string }[],
): Promise<PositionDecision> {
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
    log("AGENT", `Kimi: Using model=${KIMI_MODEL}, temp=${KIMI_TEMPERATURE}, max_tokens=${KIMI_MAX_TOKENS}`);
    
    const response = await kimi.chat.completions.create({
      model: KIMI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a DeFi liquidity management AI. Always respond with valid JSON only, no markdown formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: KIMI_TEMPERATURE,
      max_tokens: KIMI_MAX_TOKENS,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";

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
    logError("Failed to parse Kimi response", error);
    return {
      action: "HOLD",
      reason: "Failed to parse LLM response",
      confidence: 0,
    };
  }
}
