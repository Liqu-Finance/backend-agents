import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Liqu Finance Backend Agent API",
      version: "1.0.0",
      description: `
## AI-Powered Concentrated Liquidity Management Agent

This API provides endpoints for interacting with the Liqu Finance backend agent, 
which manages concentrated liquidity positions on Uniswap V4 pools using AI-driven decisions.

### Key Features
- **Pool State**: Real-time pool metrics and analysis
- **Deposit Management**: User and agent deposit tracking
- **Position Management**: Liquidity position details and operations
- **AI Analysis**: Gemini-powered pool analysis and recommendations
- **ERC-8004 Integration**: Agent identity, reputation, and validation

### Blockchain Network
- Chain: Unichain Sepolia (Chain ID: 1301)
- Pool: USDT/WETH (0.3% fee)
      `,
      contact: {
        name: "Liqu Finance Team",
      },
      license: {
        name: "ISC",
      },
    },
    servers: [
      {
        url: "http://localhost:3001",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Pool",
        description: "Pool state and metrics",
      },
      {
        name: "Deposits",
        description: "User and agent deposit management",
      },
      {
        name: "Positions",
        description: "Liquidity position operations",
      },
      {
        name: "Agents",
        description: "ERC-8004 agent identity and management",
      },
      {
        name: "Validation",
        description: "ERC-8004 validation status",
      },
      {
        name: "Strategies",
        description: "Strategy configurations",
      },
      {
        name: "Analysis",
        description: "AI-powered pool analysis",
      },
      {
        name: "Operations",
        description: "Agent assignment and rebalancing operations",
      },
    ],
    components: {
      schemas: {
        PoolState: {
          type: "object",
          properties: {
            sqrtPriceX96: {
              type: "string",
              description: "Square root price in Q96 format",
              example: "1234567890123456789012345678901234567890",
            },
            tick: {
              type: "integer",
              description: "Current tick of the pool",
              example: -201600,
            },
            liquidity: {
              type: "string",
              description: "Total liquidity in the pool",
              example: "123456789012345678",
            },
            feeGrowthGlobal0: {
              type: "string",
              description: "Fee growth for token0",
            },
            feeGrowthGlobal1: {
              type: "string",
              description: "Fee growth for token1",
            },
            price: {
              type: "number",
              description: "Current price in USDT/WETH",
              example: 2453.21,
            },
            token0: {
              type: "string",
              description: "Token0 address (USDT)",
            },
            token1: {
              type: "string",
              description: "Token1 address (WETH)",
            },
            fee: {
              type: "integer",
              description: "Pool fee in basis points",
              example: 3000,
            },
            tickSpacing: {
              type: "integer",
              description: "Tick spacing for the pool",
              example: 60,
            },
          },
        },
        DepositInfo: {
          type: "object",
          properties: {
            depositId: {
              type: "integer",
              description: "Unique deposit identifier",
            },
            user: {
              type: "string",
              description: "User address who created the deposit",
            },
            amount0Remaining: {
              type: "string",
              description: "Remaining amount of token0",
            },
            amount1Remaining: {
              type: "string",
              description: "Remaining amount of token1",
            },
            lockUntil: {
              type: "integer",
              description: "Unix timestamp until which the deposit is locked",
            },
            strategy: {
              type: "integer",
              description: "Strategy index (0=CONSERVATIVE, 1=BALANCED, 2=DEGEN)",
            },
            strategyName: {
              type: "string",
              enum: ["CONSERVATIVE", "BALANCED", "DEGEN"],
              description: "Human-readable strategy name",
            },
            assignedAgent: {
              type: "string",
              description: "Address of the assigned agent",
            },
            status: {
              type: "integer",
              description: "Deposit status (0=Active, 1=Completed, 2=Cancelled)",
            },
            positionTokenIds: {
              type: "array",
              items: {
                type: "integer",
              },
              description: "Array of position NFT token IDs",
            },
          },
        },
        PositionInfo: {
          type: "object",
          properties: {
            tokenId: {
              type: "integer",
              description: "Position NFT token ID",
            },
            liquidity: {
              type: "string",
              description: "Position liquidity",
            },
            tickLower: {
              type: "integer",
              description: "Lower tick bound of the position",
            },
            tickUpper: {
              type: "integer",
              description: "Upper tick bound of the position",
            },
            currentTick: {
              type: "integer",
              description: "Current pool tick",
            },
            sqrtPriceX96: {
              type: "string",
              description: "Current sqrt price",
            },
          },
        },
        AgentInfo: {
          type: "object",
          properties: {
            agentId: {
              type: "integer",
              description: "Unique agent identifier",
            },
            domain: {
              type: "string",
              description: "Agent domain name",
            },
            address: {
              type: "string",
              description: "Agent wallet address",
            },
          },
        },
        AgentDetails: {
          type: "object",
          properties: {
            agentId: {
              type: "integer",
            },
            domain: {
              type: "string",
            },
            address: {
              type: "string",
            },
            strategy: {
              type: "string",
              enum: ["CONSERVATIVE", "BALANCED", "DEGEN", "UNKNOWN"],
            },
            strategyConfig: {
              $ref: "#/components/schemas/StrategyConfig",
            },
            authorized: {
              type: "boolean",
              description: "Whether the agent is authorized",
            },
          },
        },
        AgentReputation: {
          type: "object",
          properties: {
            agentId: {
              type: "integer",
            },
            domain: {
              type: "string",
            },
            address: {
              type: "string",
            },
            totalValidations: {
              type: "integer",
              description: "Total number of validations",
            },
            respondedValidations: {
              type: "integer",
              description: "Number of validations responded to",
            },
            averageScore: {
              type: "number",
              description: "Average validation score",
            },
            validationHistory: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  dataHash: {
                    type: "string",
                  },
                  score: {
                    type: "integer",
                    nullable: true,
                  },
                  responded: {
                    type: "boolean",
                  },
                },
              },
            },
            feedbackAuthorizations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clientAgentId: {
                    type: "integer",
                  },
                  feedbackAuthId: {
                    type: "string",
                  },
                },
              },
            },
            totalFeedbackAuths: {
              type: "integer",
            },
            reputationScore: {
              type: "integer",
              description: "Computed reputation score (0-100)",
            },
          },
        },
        StrategyConfig: {
          type: "object",
          properties: {
            tickRangeMultiplier: {
              type: "number",
              description: "Multiplier for tick range calculation",
            },
            maxSlippage: {
              type: "number",
              description: "Maximum allowed slippage",
            },
            rebalanceThreshold: {
              type: "number",
              description: "Threshold for triggering rebalance",
            },
            description: {
              type: "string",
              description: "Strategy description",
            },
          },
        },
        PositionDecision: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["MINT", "CLOSE", "HOLD", "REBALANCE"],
              description: "Recommended action",
            },
            tickLower: {
              type: "integer",
              nullable: true,
              description: "Recommended lower tick (for MINT/REBALANCE)",
            },
            tickUpper: {
              type: "integer",
              nullable: true,
              description: "Recommended upper tick (for MINT/REBALANCE)",
            },
            reason: {
              type: "string",
              description: "Explanation for the recommendation",
            },
            confidence: {
              type: "integer",
              description: "Confidence score (0-100)",
            },
          },
        },
        AnalyzeResponse: {
          type: "object",
          properties: {
            strategy: {
              type: "string",
              enum: ["CONSERVATIVE", "BALANCED", "DEGEN"],
            },
            strategyConfig: {
              $ref: "#/components/schemas/StrategyConfig",
            },
            pool: {
              type: "object",
              properties: {
                tick: {
                  type: "integer",
                },
                price: {
                  type: "number",
                },
                liquidity: {
                  type: "string",
                },
              },
            },
            recommendation: {
              $ref: "#/components/schemas/PositionDecision",
            },
            agentAddress: {
              type: "string",
              description: "Recommended agent address for this strategy",
            },
          },
        },
        AssignResponse: {
          type: "object",
          properties: {
            depositId: {
              type: "integer",
            },
            alreadyAssigned: {
              type: "boolean",
            },
            assignedAgent: {
              type: "string",
              description: "Current assigned agent (if already assigned)",
            },
            strategy: {
              type: "string",
              enum: ["CONSERVATIVE", "BALANCED", "DEGEN"],
            },
            agentAddress: {
              type: "string",
              description: "Recommended agent address",
            },
            contractAddress: {
              type: "string",
              description: "Contract address for assignment call",
            },
            calldata: {
              type: "object",
              properties: {
                function: {
                  type: "string",
                },
                args: {
                  type: "array",
                  items: {},
                },
              },
            },
          },
        },
        RebalanceResponse: {
          type: "object",
          properties: {
            depositId: {
              type: "integer",
            },
            strategy: {
              type: "string",
            },
            action: {
              type: "string",
              example: "REBALANCE",
            },
            previousPositions: {
              type: "array",
              items: {
                type: "integer",
              },
            },
            newPosition: {
              type: "integer",
              nullable: true,
            },
            newTickLower: {
              type: "integer",
            },
            newTickUpper: {
              type: "integer",
            },
            reason: {
              type: "string",
            },
            pool: {
              type: "object",
              properties: {
                tick: {
                  type: "integer",
                },
                price: {
                  type: "number",
                },
              },
            },
            updatedDeposit: {
              type: "object",
              properties: {
                amount0Remaining: {
                  type: "string",
                },
                amount1Remaining: {
                  type: "string",
                },
                positionTokenIds: {
                  type: "array",
                  items: {
                    type: "integer",
                  },
                },
              },
            },
          },
        },
        DepositEvent: {
          type: "object",
          properties: {
            depositId: {
              type: "integer",
            },
            user: {
              type: "string",
            },
            amount0: {
              type: "string",
            },
            amount1: {
              type: "string",
            },
            strategy: {
              type: "string",
              enum: ["CONSERVATIVE", "BALANCED", "DEGEN"],
            },
            lockUntil: {
              type: "integer",
            },
            recommendedAgent: {
              type: "string",
            },
            timestamp: {
              type: "integer",
            },
          },
        },
        ValidationStatus: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["NOT_FOUND", "PENDING", "RESPONDED"],
            },
            score: {
              type: "integer",
              nullable: true,
              description: "Validation score (only present when status is RESPONDED)",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
            },
          },
        },
        AgentRunResult: {
          type: "object",
          properties: {
            agentId: {
              type: "integer",
              description: "Agent ID that processed the deposits",
            },
            agentDomain: {
              type: "string",
              description: "Agent domain name",
            },
            agentAddress: {
              type: "string",
              description: "Agent wallet address",
            },
            pool: {
              type: "object",
              properties: {
                tick: {
                  type: "integer",
                  description: "Current pool tick",
                },
                price: {
                  type: "number",
                  description: "Current pool price",
                },
                liquidity: {
                  type: "string",
                  description: "Current pool liquidity",
                },
              },
            },
            depositsProcessed: {
              type: "integer",
              description: "Number of deposits processed",
            },
            depositResults: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  depositId: {
                    type: "integer",
                  },
                  status: {
                    type: "string",
                    enum: ["processed", "skipped", "error"],
                  },
                  message: {
                    type: "string",
                  },
                },
              },
            },
            timestamp: {
              type: "integer",
              description: "Unix timestamp of the run",
            },
          },
        },
      },
    },
  },
  apis: ["./src/swagger-docs.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #6366f1; }
      `,
      customSiteTitle: "Liqu Finance API Documentation",
    })
  );

  // Serve raw OpenAPI spec
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
