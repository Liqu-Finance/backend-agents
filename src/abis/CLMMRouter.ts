export const CLMMRouterABI = [
  "function getPoolState(tuple(address token0, address token1, uint24 fee, int24 tickSpacing, address hooks)) view returns (tuple(bytes32 poolId, uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee, uint128 liquidity, uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1))",
  "function getPosition(uint256 tokenId) view returns (tuple(uint256 tokenId, uint128 liquidity, int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96, int24 currentTick, uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1))",
  "function sqrtPriceToTick(uint160 sqrtPriceX96, int24 tickSpacing) pure returns (int24)",
  "function tickToSqrtPrice(int24 tick) pure returns (uint160)",
  "function getTickBounds(int24 tickSpacing) pure returns (int24 minTick, int24 maxTick)",
];
