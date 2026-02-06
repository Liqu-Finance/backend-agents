import { contracts, POOL_PARAMS } from "./config";
import { PoolState, DepositInfo, PositionInfo } from "./types";

export async function getPoolState(): Promise<PoolState> {
  const state = await contracts.router.getPoolState(POOL_PARAMS);
  return {
    sqrtPriceX96: state.sqrtPriceX96,
    tick: Number(state.tick),
    liquidity: state.liquidity,
    feeGrowthGlobal0: state.feeGrowthGlobal0,
    feeGrowthGlobal1: state.feeGrowthGlobal1,
  };
}

export async function getDepositInfo(depositId: number): Promise<DepositInfo> {
  const dep = await contracts.agent.getDeposit(depositId);
  return {
    user: dep.user,
    amount0Remaining: dep.amount0Remaining,
    amount1Remaining: dep.amount1Remaining,
    lockUntil: Number(dep.lockUntil),
    strategy: Number(dep.strategy),
    assignedAgent: dep.assignedAgent,
    status: Number(dep.status),
    positionTokenIds: dep.positionTokenIds.map(Number),
  };
}

export async function getPositionInfo(tokenId: number): Promise<PositionInfo> {
  const pos = await contracts.router.getPosition(tokenId);
  return {
    tokenId: Number(pos.tokenId),
    liquidity: pos.liquidity,
    tickLower: Number(pos.tickLower),
    tickUpper: Number(pos.tickUpper),
    currentTick: Number(pos.currentTick),
    sqrtPriceX96: pos.sqrtPriceX96,
  };
}

export function tickToPrice(tick: number, decimals0 = 6, decimals1 = 18): number {
  const price = Math.pow(1.0001, tick);
  return price * Math.pow(10, decimals1 - decimals0);
}

export async function getMyAssignedDeposits(agentAddress: string): Promise<number[]> {
  const nextId = Number(await contracts.agent.nextDepositId());
  const myDeposits: number[] = [];

  for (let i = 1; i < nextId; i++) {
    try {
      const dep = await contracts.agent.getDeposit(i);
      if (
        dep.assignedAgent.toLowerCase() === agentAddress.toLowerCase() &&
        Number(dep.status) === 0
      ) {
        myDeposits.push(i);
      }
    } catch {
      // Skip deposits that fail to load
    }
  }
  return myDeposits;
}
