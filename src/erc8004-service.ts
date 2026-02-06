import { ethers } from "ethers";
import { contracts, agentWallet } from "./config";
import { AgentInfo } from "./types";
import { log, logError } from "./logger";

// ─────────────────────────────────────────────
//  IDENTITY — Verify who agents are
// ─────────────────────────────────────────────

export async function getMyAgentInfo(): Promise<AgentInfo> {
  const info = await contracts.identity.resolveByAddress(agentWallet.address);
  return {
    agentId: Number(info.agentId),
    domain: info.agentDomain,
    address: info.agentAddress,
  };
}

export async function verifyAgentRegistered(address: string): Promise<boolean> {
  try {
    const info = await contracts.identity.resolveByAddress(address);
    return Number(info.agentId) > 0;
  } catch {
    return false;
  }
}

export async function getTotalAgents(): Promise<number> {
  return Number(await contracts.identity.getAgentCount());
}

// ─────────────────────────────────────────────
//  REPUTATION — Feedback between agents
// ─────────────────────────────────────────────

export async function acceptFeedbackFrom(
  clientAgentId: number,
  myAgentId: number
): Promise<void> {
  const tx = await contracts.reputation.acceptFeedback(clientAgentId, myAgentId);
  await tx.wait();
  log("ERC-8004", `Accepted feedback auth from agent ${clientAgentId}`);
}

export async function isFeedbackAuthorized(
  clientId: number,
  serverId: number
): Promise<{ authorized: boolean; authId: string }> {
  const [authorized, authId] = await contracts.reputation.isFeedbackAuthorized(
    clientId,
    serverId
  );
  return { authorized, authId };
}

// ─────────────────────────────────────────────
//  VALIDATION — Independent validation of decisions
// ─────────────────────────────────────────────

// In-memory tracking (Unichain Sepolia RPC doesn't support queryFilter reliably)
interface ValidationRecord {
  dataHash: string;
  agentId: number;       // server agent
  validatorId: number;   // validator agent
  score: number | null;
  responded: boolean;
  timestamp: number;
}

const validationStore: ValidationRecord[] = [];

export function getValidationStore(): readonly ValidationRecord[] {
  return validationStore;
}

export async function requestValidation(
  validatorAgentId: number,
  myAgentId: number,
  decisionData: object
): Promise<string> {
  const dataHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(decisionData))
  );

  const tx = await contracts.validation.validationRequest(
    validatorAgentId,
    myAgentId,
    dataHash
  );
  await tx.wait();

  // Track in-memory
  validationStore.push({
    dataHash,
    agentId: myAgentId,
    validatorId: validatorAgentId,
    score: null,
    responded: false,
    timestamp: Date.now(),
  });

  log("ERC-8004", `Validation requested, dataHash=${dataHash}`);
  return dataHash;
}

export async function submitValidationResponse(
  dataHash: string,
  score: number
): Promise<void> {
  const tx = await contracts.validation.validationResponse(dataHash, score);
  await tx.wait();

  // Update in-memory record
  const record = validationStore.find((r) => r.dataHash === dataHash);
  if (record) {
    record.score = score;
    record.responded = true;
  }

  log("ERC-8004", `Validation response submitted, score=${score}`);
}

export async function getValidationStatus(
  dataHash: string
): Promise<{ status: string; score?: number }> {
  // Check in-memory first
  const record = validationStore.find((r) => r.dataHash === dataHash);
  if (record) {
    if (record.responded) return { status: "RESPONDED", score: record.score! };
    return { status: "PENDING" };
  }

  // Fallback to on-chain
  const [exists, pending] = await contracts.validation.isValidationPending(dataHash);
  if (!exists) return { status: "NOT_FOUND" };
  if (pending) return { status: "PENDING" };

  const [hasResponse, score] = await contracts.validation.getValidationResponse(dataHash);
  return { status: "RESPONDED", score: Number(score) };
}

// ─────────────────────────────────────────────
//  REPUTATION AGGREGATION — Compute agent reputation
// ─────────────────────────────────────────────

export interface AgentReputation {
  agentId: number;
  domain: string;
  address: string;
  // Validation stats
  totalValidations: number;
  respondedValidations: number;
  averageScore: number;
  validationHistory: { dataHash: string; score: number | null; responded: boolean }[];
  // Feedback stats
  feedbackAuthorizations: { clientAgentId: number; feedbackAuthId: string }[];
  totalFeedbackAuths: number;
  // Computed reputation
  reputationScore: number; // 0-100
}

export async function getAgentReputation(agentId: number): Promise<AgentReputation> {
  // Get agent identity
  const info = await contracts.identity.getAgent(agentId);
  const totalAgents = await getTotalAgents();

  // ── Validation history from in-memory store ──
  const agentValidations = validationStore.filter((r) => r.agentId === agentId);

  // Also try on-chain queryFilter as supplement (may fail on Unichain Sepolia)
  try {
    const requestFilter = contracts.validation.filters.ValidationRequestEvent(null, agentId);
    const responseFilter = contracts.validation.filters.ValidationResponseEvent(null, agentId);

    const [requestLogs, responseLogs] = await Promise.all([
      contracts.validation.queryFilter(requestFilter),
      contracts.validation.queryFilter(responseFilter),
    ]);

    // Merge on-chain events into store (dedup by dataHash)
    const knownHashes = new Set(validationStore.map((r) => r.dataHash));
    const responseMap = new Map<string, number>();
    for (const el of responseLogs) {
      const args = (el as any).args;
      if (args) responseMap.set(args.dataHash, Number(args.response));
    }

    for (const el of requestLogs) {
      const args = (el as any).args;
      if (!args) continue;
      const dh = args.dataHash as string;
      if (knownHashes.has(dh)) continue;

      const score = responseMap.get(dh);
      validationStore.push({
        dataHash: dh,
        agentId: Number(args.agentServerId),
        validatorId: Number(args.agentValidatorId),
        score: score !== undefined ? score : null,
        responded: score !== undefined,
        timestamp: 0,
      });
    }
  } catch (err) {
    logError("queryFilter failed (expected on Unichain Sepolia), using in-memory only", err);
  }

  // Re-filter after potential merge
  const allValidations = validationStore.filter((r) => r.agentId === agentId);
  const validationHistory = allValidations.map((r) => ({
    dataHash: r.dataHash,
    score: r.score,
    responded: r.responded,
  }));

  const respondedValidations = allValidations.filter((v) => v.responded).length;
  const scores = allValidations.filter((v) => v.score !== null).map((v) => v.score!);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // ── Feedback authorizations ──
  // Check all agent pairs for feedback auth
  const feedbackAuthorizations: { clientAgentId: number; feedbackAuthId: string }[] = [];
  for (let i = 1; i <= totalAgents; i++) {
    if (i === agentId) continue;
    try {
      const { authorized, authId } = await isFeedbackAuthorized(i, agentId);
      if (authorized) {
        feedbackAuthorizations.push({ clientAgentId: i, feedbackAuthId: authId });
      }
    } catch {
      // skip
    }
  }

  // ── Compute reputation score (0-100) ──
  const validationScoreComponent = averageScore * 0.6;

  const responseRate = allValidations.length > 0
    ? (respondedValidations / allValidations.length) * 100
    : 0;
  const responseRateComponent = responseRate * 0.2;

  const maxPossibleAuths = Math.max(totalAgents - 1, 1);
  const trustRatio = (feedbackAuthorizations.length / maxPossibleAuths) * 100;
  const trustComponent = trustRatio * 0.2;

  const reputationScore = allValidations.length === 0 && feedbackAuthorizations.length === 0
    ? 50
    : Math.round(validationScoreComponent + responseRateComponent + trustComponent);

  return {
    agentId: Number(info.agentId),
    domain: info.agentDomain,
    address: info.agentAddress,
    totalValidations: allValidations.length,
    respondedValidations,
    averageScore: Math.round(averageScore * 100) / 100,
    validationHistory,
    feedbackAuthorizations,
    totalFeedbackAuths: feedbackAuthorizations.length,
    reputationScore,
  };
}
