# BaseAlphaArb: A DeFi Arbitrage Bot for the Base Network

BaseAlphaArb is a sophisticated arbitrage bot designed to capitalize on price discrepancies in the DeFi markets on the Base network. It leverages Aave V3 flash loans to execute complex, multi-hop atomic swaps, maximizing profitability while minimizing risk.

## Features

- **Aave V3 Flash Loans:** Utilizes flash loans to borrow large amounts of capital for a single transaction, enabling arbitrage opportunities that would otherwise be inaccessible.
- **Multi-Hop Atomic Swaps:** Executes complex trades across multiple DEXs in a single, atomic transaction, ensuring that the trade either completes successfully or not at all.
- **DEX Aggregator Integration:** Integrates with popular DEX aggregators like 1inch, Odos, and CoW Swap to find the best possible swap routes and prices.
- **Statistical Arbitrage Engine:** Employs a Z-score engine to identify high-conviction trading opportunities based on statistical analysis of price movements.
- **MEV Protection:** Protects trades from front-running and other forms of MEV by sending transactions through private channels like MEV-Share, Flashbots Protect, and bloXroute.
- **Dynamic Token Discovery:** Automatically discovers new and high-volume tokens using the DexScreener API, ensuring that the bot is always aware of the latest market trends.
- **Comprehensive Configuration:** Allows for fine-tuning of all key parameters, including profit thresholds, slippage buffers, and Z-score settings.

## Prerequisites

- Node.js (v16 or higher)
- npm
- A code editor (e.g., VS Code)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/BaseAlphaArb.git
    cd BaseAlphaArb
    ```

2.  **Install the dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Create a `.env` file:**
    ```bash
    cp .env.example .env
    ```

2.  **Edit the `.env` file:**
    - `PRIVATE_KEY`: Your wallet private key.
    - `BASE_RPC_URL`: The RPC URL for the Base mainnet.
    - `BASE_SEPOLIA_RPC_URL`: The RPC URL for the Base Sepolia testnet.
    - `DEXSCREENER_API_KEY`: Your DexScreener API key.
    - `ONEINCH_API_KEY`: Your 1inch API key.

3.  **Edit the `config/config.json` file:**
    - `hubAssets`: The list of hub assets to use for scanning (e.g., "WETH", "USDC").
    - `slippageBuffer`: The allowed slippage for trades.
    - `profitThreshold`: The minimum profit threshold for a trade to be considered.
    - `zScoreThreshold`: The Z-score threshold for a high-conviction signal.
    - `aggregatorUrls`: The API URLs for the DEX aggregators.
    - `mevProtection`: The RPC URLs for the MEV protection services.


## Deployment

1.  **Edit the `hardhat.config.js` file:**
    - Ensure that the `base` and `baseSepolia` networks are configured with the correct RPC URLs and your private key.

2.  **Deploy the `BaseAlphaArb.sol` smart contract:**
    ```bash
    npx hardhat run scripts/deploy.js --network base
    ```
    or for the Sepolia testnet:
    ```bash
    npx hardhat run scripts/deploy.js --network baseSepolia
    ```
    The deployed contract address will be automatically saved to the `config/config.json` file.


## Usage

1.  **Start the bot:**
    ```bash
    node src/bot.js
    ```

2.  **Monitor the output:**
    The bot will log its progress to the console, including any profitable opportunities that it finds and executes.


## Disclaimer

This is a complex and high-risk tool. Arbitrage trading in the DeFi markets is highly competitive and can be subject to significant risks, including smart contract vulnerabilities, network congestion, and sudden price movements. Use this bot at your own risk. The author is not responsible for any financial losses that you may incur.
