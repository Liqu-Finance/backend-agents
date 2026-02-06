export const ValidationRegistryABI = [
  "function validationRequest(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash) external",
  "function validationResponse(bytes32 dataHash, uint8 response) external",
  "function getValidationRequest(bytes32 dataHash) view returns (tuple(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash, uint256 timestamp, bool responded))",
  "function isValidationPending(bytes32 dataHash) view returns (bool exists, bool pending)",
  "function getValidationResponse(bytes32 dataHash) view returns (bool hasResponse, uint8 response)",

  // Events
  "event ValidationRequestEvent(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash)",
  "event ValidationResponseEvent(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash, uint8 response)",
];
