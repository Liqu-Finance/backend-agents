export const IdentityRegistryABI = [
  "function getAgent(uint256 agentId) view returns (tuple(uint256 agentId, string agentDomain, address agentAddress))",
  "function resolveByDomain(string agentDomain) view returns (tuple(uint256 agentId, string agentDomain, address agentAddress))",
  "function resolveByAddress(address agentAddress) view returns (tuple(uint256 agentId, string agentDomain, address agentAddress))",
  "function agentExists(uint256 agentId) view returns (bool)",
  "function getAgentCount() view returns (uint256)",
];
