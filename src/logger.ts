type LogTag = "AGENT" | "POOL" | "GEMINI" | "TX" | "ERC-8004" | "ERROR" | "SKIP" | "HOLD" | "REBALANCE";

function timestamp(): string {
  return new Date().toISOString();
}

export function log(tag: LogTag, message: string): void {
  console.log(`${timestamp()} [${tag}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  console.error(`${timestamp()} [ERROR] ${message}`);
  if (error) {
    console.error(error);
  }
}
