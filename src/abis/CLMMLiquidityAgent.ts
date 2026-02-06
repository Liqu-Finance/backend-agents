export const CLMMLiquidityAgentABI = [
  // Read
  "function getDeposit(uint256 depositId) view returns (tuple(address user, uint256 amount0Remaining, uint256 amount1Remaining, uint256 depositTime, uint256 lockUntil, uint8 strategy, address assignedAgent, uint8 status, uint256[] positionTokenIds))",
  "function getUserDeposits(address user) view returns (uint256[])",
  "function authorizedAgents(address) view returns (bool)",
  "function agentStrategy(address) view returns (uint8)",
  "function tokenIdToDepositId(uint256) view returns (uint256)",
  "function nextDepositId() view returns (uint256)",

  // Agent write
  "function agentMintPosition(uint256 depositId, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0Max, uint256 amount1Max, uint256 deadline) external",
  "function agentClosePosition(uint256 depositId, uint256 tokenId, uint128 amount0Min, uint128 amount1Min, uint256 deadline) external",

  // Events
  "event DepositCreated(uint256 indexed depositId, address indexed user, uint256 amount0, uint256 amount1, uint8 strategy, uint256 lockUntil)",
  "event AgentAssigned(uint256 indexed depositId, address indexed agent)",
  "event PositionCreated(uint256 indexed depositId, uint256 indexed tokenId)",
  "event PositionClosed(uint256 indexed depositId, uint256 indexed tokenId)",
];
