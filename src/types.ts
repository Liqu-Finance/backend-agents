export type StrategyName = "CONSERVATIVE" | "BALANCED" | "DEGEN";
export const STRATEGY_MAP: StrategyName[] = ["CONSERVATIVE", "BALANCED", "DEGEN"];

export interface PoolState {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  feeGrowthGlobal0: bigint;
  feeGrowthGlobal1: bigint;
}

export interface DepositInfo {
  user: string;
  amount0Remaining: bigint;
  amount1Remaining: bigint;
  lockUntil: number;
  strategy: number;
  assignedAgent: string;
  status: number;
  positionTokenIds: number[];
}

export interface PositionInfo {
  tokenId: number;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  sqrtPriceX96: bigint;
}

export interface PoolAnalysis {
  currentTick: number;
  currentPrice: number;
  liquidity: string;
  feeGrowth0: string;
  feeGrowth1: string;
}

export interface PositionDecision {
  action: "MINT" | "CLOSE" | "HOLD" | "REBALANCE";
  tickLower?: number;
  tickUpper?: number;
  reason: string;
  confidence: number;
}

export interface StrategyConfig {
  tickRangeMultiplier: number;
  maxSlippage: number;
  rebalanceThreshold: number;
  description: string;
}

export interface AgentInfo {
  agentId: number;
  domain: string;
  address: string;
}
