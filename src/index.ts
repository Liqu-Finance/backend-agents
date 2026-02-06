import { runAgentLoop } from "./agent";
import { app } from "./api";
import { startDepositListener } from "./event-listener";
import { log, logError } from "./logger";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

function validateEnv(): void {
  const required = ["AGENT_PRIVATE_KEY", "GEMINI_API_KEY", "RPC_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function main(): Promise<void> {
  try {
    validateEnv();
    console.log("========================================");
    console.log("  Liqu Finance — Backend Agent");
    console.log("  Unichain Sepolia (Chain 1301)");
    console.log("========================================\n");

    // Start Express API server
    app.listen(PORT, () => {
      log("AGENT", `API server running on http://localhost:${PORT}`);
      log("AGENT", `Swagger docs available at http://localhost:${PORT}/api-docs`);
    });

    // Start on-chain event listener for new deposits
    startDepositListener();

    // Start agent loop (runs forever alongside Express)
    // await runAgentLoop();
  } catch (error) {
    logError("Fatal error", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => {
  logError("Unhandled rejection", error);
  process.exit(1);
});

main();
