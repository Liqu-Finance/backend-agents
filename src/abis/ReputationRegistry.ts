export const ReputationRegistryABI = [
  "function acceptFeedback(uint256 agentClientId, uint256 agentServerId) external",
  "function isFeedbackAuthorized(uint256 agentClientId, uint256 agentServerId) view returns (bool isAuthorized, bytes32 feedbackAuthId)",
  "function getFeedbackAuthId(uint256 agentClientId, uint256 agentServerId) view returns (bytes32)",

  // Events
  "event AuthFeedback(uint256 indexed agentClientId, uint256 indexed agentServerId, bytes32 indexed feedbackAuthId)",
];
