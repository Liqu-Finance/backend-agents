import { contracts, provider, agentWallet } from "./config";
import { STRATEGY_MAP, StrategyName } from "./types";
import { log, logError } from "./logger";
import { processDeposit } from "./agent";

const AGENT_ADDRESSES: Record<StrategyName, string> = {
  CONSERVATIVE: "0x5b6A404F8958E7e10028301549e61435925725Bf",
  BALANCED: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607",
  DEGEN: "0x5B20B5a4Bba73bC6363fBE90E6b2Ab4fFF5C820e",
};

const POLL_INTERVAL = 15_000; // 15 seconds

export interface DepositEvent {
  depositId: number;
  user: string;
  amount0: string;
  amount1: string;
  strategy: StrategyName;
  lockUntil: number;
  recommendedAgent: string;
  timestamp: number;
}

// In-memory store of recent deposits (frontend can poll this)
const recentDeposits: DepositEvent[] = [];
const MAX_RECENT = 50;

export function getRecentDeposits(): DepositEvent[] {
  return recentDeposits;
}

export function startDepositListener(): void {
  log("AGENT", "Starting DepositCreated event poller...");

  let lastBlock = 0;

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();

      if (lastBlock === 0) {
        // On first run, only look back ~100 blocks
        lastBlock = Math.max(0, currentBlock - 100);
      }

      if (currentBlock <= lastBlock) return;

      // Query DepositCreated events
      const depositFilter = contracts.agent.filters.DepositCreated();
      const depositLogs = await contracts.agent.queryFilter(
        depositFilter,
        lastBlock + 1,
        currentBlock
      );

      for (const eventLog of depositLogs) {
        const args = (eventLog as any).args;
        if (!args) continue;

        const strategyIndex = Number(args.strategy);
        const strategyName = STRATEGY_MAP[strategyIndex];
        const recommendedAgent = AGENT_ADDRESSES[strategyName];

        const event: DepositEvent = {
          depositId: Number(args.depositId),
          user: args.user,
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
          strategy: strategyName,
          lockUntil: Number(args.lockUntil),
          recommendedAgent,
          timestamp: Date.now(),
        };

        log(
          "AGENT",
          `New deposit detected! #${event.depositId} from ${event.user} | strategy=${strategyName} | agent=${recommendedAgent}`
        );

        recentDeposits.unshift(event);
        if (recentDeposits.length > MAX_RECENT) {
          recentDeposits.pop();
        }
      }

      // Query AgentAssigned events
      const assignFilter = contracts.agent.filters.AgentAssigned();
      const assignLogs = await contracts.agent.queryFilter(
        assignFilter,
        lastBlock + 1,
        currentBlock
      );

      for (const eventLog of assignLogs) {
        const args = (eventLog as any).args;
        if (!args) continue;

        const depositId = Number(args.depositId);
        const assignedAgent = args.agent as string;
        log("AGENT", `Agent assigned! deposit #${depositId} → ${assignedAgent}`);

        // If assigned to us, process immediately instead of waiting for next loop
        if (assignedAgent.toLowerCase() === agentWallet.address.toLowerCase()) {
          log("AGENT", `Deposit #${depositId} assigned to us — processing immediately`);
          processDeposit(depositId).catch((err) =>
            logError(`Immediate processing failed for deposit #${depositId}`, err)
          );
        }
      }

      lastBlock = currentBlock;
    } catch (error) {
      logError("Event poller error", error);
    }
  }

  // Initial poll, then repeat
  poll();
  setInterval(poll, POLL_INTERVAL);
}
