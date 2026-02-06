/**
 * @swagger
 * /api/pool/state:
 *   get:
 *     summary: Get current pool state
 *     description: Returns the current state of the USDT/WETH pool including tick, price, and liquidity
 *     tags: [Pool]
 *     responses:
 *       200:
 *         description: Pool state retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PoolState'
 *       500:
 *         description: Failed to fetch pool state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/deposits/user/{address}:
 *   get:
 *     summary: Get user deposits
 *     description: Returns all deposit IDs for a specific user address
 *     tags: [Deposits]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: User wallet address
 *         example: "0x1234567890123456789012345678901234567890"
 *     responses:
 *       200:
 *         description: User deposit IDs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 depositIds:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 2, 3]
 *       500:
 *         description: Failed to fetch user deposits
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/deposits/agent/{address}:
 *   get:
 *     summary: Get agent deposits
 *     description: Returns all active deposit IDs assigned to a specific agent
 *     tags: [Deposits]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent wallet address
 *         example: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607"
 *     responses:
 *       200:
 *         description: Agent deposit IDs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 depositIds:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [4, 7, 12]
 *       500:
 *         description: Failed to fetch agent deposits
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/deposits/{id}:
 *   get:
 *     summary: Get deposit details
 *     description: Returns detailed information about a specific deposit
 *     tags: [Deposits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Deposit ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Deposit details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DepositInfo'
 *       500:
 *         description: Failed to fetch deposit
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/deposits/{id}/positions:
 *   get:
 *     summary: Get deposit positions
 *     description: Returns all liquidity positions associated with a deposit
 *     tags: [Deposits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Deposit ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Deposit positions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 depositId:
 *                   type: integer
 *                 strategy:
 *                   type: string
 *                   enum: [CONSERVATIVE, BALANCED, DEGEN]
 *                 positions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PositionInfo'
 *       500:
 *         description: Failed to fetch deposit positions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/deposits/recent:
 *   get:
 *     summary: Get recent deposits
 *     description: Returns the most recent deposits detected by the event listener (up to 50)
 *     tags: [Deposits]
 *     responses:
 *       200:
 *         description: Recent deposits retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deposits:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DepositEvent'
 */

/**
 * @swagger
 * /api/positions/{tokenId}:
 *   get:
 *     summary: Get position details
 *     description: Returns detailed information about a specific liquidity position by token ID
 *     tags: [Positions]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Position NFT token ID
 *         example: 12345
 *     responses:
 *       200:
 *         description: Position details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PositionInfo'
 *       500:
 *         description: Failed to fetch position
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/agents/count:
 *   get:
 *     summary: Get total agent count
 *     description: Returns the total number of registered agents in the ERC-8004 Identity Registry
 *     tags: [Agents]
 *     responses:
 *       200:
 *         description: Agent count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 3
 *       500:
 *         description: Failed to fetch agent count
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/agents/all:
 *   get:
 *     summary: List all agents
 *     description: Returns a list of all registered agents with their strategy and authorization status
 *     tags: [Agents]
 *     responses:
 *       200:
 *         description: Agents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AgentDetails'
 *       500:
 *         description: Failed to fetch agents
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/agents/{id}:
 *   get:
 *     summary: Get agent by ID
 *     description: Returns agent information for a specific agent ID
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Agent ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Agent retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentInfo'
 *       500:
 *         description: Agent not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/agents/address/{address}:
 *   get:
 *     summary: Resolve agent by address
 *     description: Returns agent information for a specific wallet address
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent wallet address
 *         example: "0x6c52aAD1Cbb66C0f666b62b36261d2f2205A8607"
 *     responses:
 *       200:
 *         description: Agent resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentInfo'
 *       500:
 *         description: Agent not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/agents/{id}/reputation:
 *   get:
 *     summary: Get agent reputation
 *     description: Returns comprehensive reputation metrics for a specific agent including validation history and computed reputation score
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Agent ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Agent reputation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentReputation'
 *       500:
 *         description: Failed to fetch agent reputation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/validation/{dataHash}:
 *   get:
 *     summary: Get validation status
 *     description: Returns the validation status for a specific data hash from the ERC-8004 Validation Registry
 *     tags: [Validation]
 *     parameters:
 *       - in: path
 *         name: dataHash
 *         required: true
 *         schema:
 *           type: string
 *         description: Keccak256 hash of the validation data
 *         example: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
 *     responses:
 *       200:
 *         description: Validation status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationStatus'
 *       500:
 *         description: Failed to fetch validation status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/strategies:
 *   get:
 *     summary: Get all strategies
 *     description: Returns configuration details for all available risk strategies
 *     tags: [Strategies]
 *     responses:
 *       200:
 *         description: Strategies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 CONSERVATIVE:
 *                   $ref: '#/components/schemas/StrategyConfig'
 *                 BALANCED:
 *                   $ref: '#/components/schemas/StrategyConfig'
 *                 DEGEN:
 *                   $ref: '#/components/schemas/StrategyConfig'
 *             example:
 *               CONSERVATIVE:
 *                 tickRangeMultiplier: 2
 *                 maxSlippage: 0.005
 *                 rebalanceThreshold: 0.7
 *                 description: "Narrow range, low risk, frequent rebalancing"
 *               BALANCED:
 *                 tickRangeMultiplier: 10
 *                 maxSlippage: 0.01
 *                 rebalanceThreshold: 0.85
 *                 description: "Medium range, moderate risk"
 *               DEGEN:
 *                 tickRangeMultiplier: 50
 *                 maxSlippage: 0.03
 *                 rebalanceThreshold: 0.95
 *                 description: "Wide range, high yield potential"
 */

/**
 * @swagger
 * /api/analyze:
 *   post:
 *     summary: Analyze pool for strategy
 *     description: Uses Gemini AI to analyze the current pool state and provide a recommendation for the specified strategy
 *     tags: [Analysis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - strategy
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: [CONSERVATIVE, BALANCED, DEGEN]
 *                 description: Risk strategy to analyze for
 *           example:
 *             strategy: "BALANCED"
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyzeResponse'
 *       400:
 *         description: Invalid strategy provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to analyze pool
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/assign/{depositId}:
 *   get:
 *     summary: Get agent assignment for deposit
 *     description: Returns the recommended agent for a deposit based on its strategy, or the current assigned agent if already assigned
 *     tags: [Operations]
 *     parameters:
 *       - in: path
 *         name: depositId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Deposit ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Agent assignment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignResponse'
 *       400:
 *         description: Deposit is not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get agent assignment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/rebalance/{depositId}:
 *   post:
 *     summary: Rebalance deposit positions
 *     description: |
 *       Triggers an AI-powered rebalance for a deposit. This will:
 *       1. Close all existing positions
 *       2. Analyze the current pool state with Gemini AI
 *       3. Mint a new position with the optimal tick range
 *       
 *       **Note**: This operation executes on-chain transactions and may take several seconds.
 *     tags: [Operations]
 *     parameters:
 *       - in: path
 *         name: depositId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Deposit ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Rebalance completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RebalanceResponse'
 *       400:
 *         description: Deposit is not active
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to rebalance position
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
