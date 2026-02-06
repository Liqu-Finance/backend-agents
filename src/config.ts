import { ethers } from "ethers";
import dotenv from "dotenv";
import { CLMMLiquidityAgentABI } from "./abis/CLMMLiquidityAgent";
import { CLMMRouterABI } from "./abis/CLMMRouter";
import { IdentityRegistryABI } from "./abis/IdentityRegistry";
import { ReputationRegistryABI } from "./abis/ReputationRegistry";
import { ValidationRegistryABI } from "./abis/ValidationRegistry";
import { StrategyConfig, StrategyName } from "./types";

dotenv.config();

export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
export const agentWallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);

export const POOL_PARAMS = {
  token0: "0x4dABf45C8cF333Ef1e874c3FDFC3C86799af80c8",
  token1: "0xf96c5C189a949C73745a277A4Acf071B1B9f6DF5",
  fee: 3000,
  tickSpacing: 60,
  hooks: ethers.ZeroAddress,
};

export const contracts = {
  agent: new ethers.Contract(
    process.env.CLMM_LIQUIDITY_AGENT!,
    CLMMLiquidityAgentABI,
    agentWallet
  ),
  router: new ethers.Contract(
    process.env.CLMM_ROUTER!,
    CLMMRouterABI,
    provider
  ),
  identity: new ethers.Contract(
    process.env.IDENTITY_REGISTRY!,
    IdentityRegistryABI,
    provider
  ),
  reputation: new ethers.Contract(
    process.env.REPUTATION_REGISTRY!,
    ReputationRegistryABI,
    agentWallet
  ),
  validation: new ethers.Contract(
    process.env.VALIDATION_REGISTRY!,
    ValidationRegistryABI,
    agentWallet
  ),
};

export const STRATEGY_CONFIG: Record<StrategyName, StrategyConfig> = {
  CONSERVATIVE: {
    tickRangeMultiplier: 2,
    maxSlippage: 0.005,
    rebalanceThreshold: 0.7,
    description: "Narrow range, low risk, frequent rebalancing",
  },
  BALANCED: {
    tickRangeMultiplier: 10,
    maxSlippage: 0.01,
    rebalanceThreshold: 0.85,
    description: "Medium range, moderate risk",
  },
  DEGEN: {
    tickRangeMultiplier: 50,
    maxSlippage: 0.03,
    rebalanceThreshold: 0.95,
    description: "Wide range, high yield potential",
  },
};
