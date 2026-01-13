const { ethers } = require('ethers');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { wallet } = require('./wallet');
const { log, sleep, withErrorHandling } = require('./utils');
const { getFlashLoanableAssets } = require('./aaveService');
const { fetchAllPairs } = require('./dexScreenerService');
const { generateAndCachePaths } = require('./pathGenerator');
const { scanAllPaths } = require('./opportunityScanner');
const aggregatorService = require('./aggregatorService');
const { sendPrivateTransaction } = require('./mevProtection');

const POLLING_INTERVAL = 4000; // 4 seconds

/**
 * Handles a profitable opportunity by preparing and executing the transaction.
 * @param {object} opportunity The profitable opportunity.
 */
async function handleOpportunity(opportunity) {
    log(`Handling multi-hop opportunity with profit: ${opportunity.netProfit.toString()}`);

    const { tokens, hops, initialAmount } = opportunity;

    if (!tokens || !hops || !initialAmount) {
        log('Invalid opportunity data.');
        return;
    }

    // Prepare the transaction for our smart contract
    const contractAddress = config.contractAddress[config.network];
    const contract = new ethers.Contract(contractAddress, [
        'function executeArb(address[] calldata tokens, Hop[] calldata hops, uint256 amount)',
    ], wallet);

    const tx = await contract.populateTransaction.executeArb(
        tokens,
        hops,
        initialAmount
    );

    // Add a buffer to the gas limit, can be estimated more accurately
    tx.gasLimit = (await wallet.provider.estimateGas(tx)) * 12n / 10n;

    log('Sending transaction...');
    const txResponse = await sendPrivateTransaction(tx);

    if (txResponse) {
        log(`Transaction sent: ${txResponse.hash}`);
        await txResponse.wait();
        log('Transaction confirmed!');
    }
}


/**
 * The main scanning loop.
 * @param {Array<Array<object>>} paths The array of arbitrage paths to scan.
 * @param {object} tokenDatabase The token database for symbol lookups.
 */
async function startScanning(paths, tokenDatabase) {
    log('Starting scanner...');
    while (true) {
        const opportunities = await scanAllPaths(paths, tokenDatabase);
        if (opportunities && opportunities.length > 0) {
            // Sort by net profit and handle the best one
            opportunities.sort((a, b) => b.netProfit - a.netProfit);
            await handleOpportunity(opportunities[0]);
        }
        await sleep(POLLING_INTERVAL);
    }
}

/**
 * The main entry point for the bot.
 */
async function main() {
    log('Starting BaseAlphaBot...');

    // Fetch dynamic assets and add them to the config
    config.hubAssets = await getFlashLoanableAssets();

    // Build the token and pair database
    const tokenDbPath = path.join(__dirname, '../config/tokenDatabase.json');
    let tokenDatabase;
    try {
        const dbData = await fs.readFile(tokenDbPath, 'utf-8');
        tokenDatabase = JSON.parse(dbData);
        log('Token database loaded from file.');
    } catch (error) {
        log('Token database not found or invalid. Building it now...');
        const dexIds = ['uniswap', 'aerodrome', 'pancakeswap'];
        tokenDatabase = await fetchAllPairs(dexIds);
        await fs.writeFile(tokenDbPath, JSON.stringify(tokenDatabase, null, 2));
        log(`Token database saved to ${tokenDbPath}`);
    }

    // Generate and cache arbitrage paths
    const pathsPath = path.join(__dirname, '../config/paths.json');
    let needsUpdate = true;
    try {
        const stats = await fs.stat(pathsPath);
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        if (stats.mtime.getTime() > twoDaysAgo) {
            needsUpdate = false;
        }
    } catch (error) {
        // File doesn't exist, so we definitely need to update
    }

    if (needsUpdate) {
        log('Arbitrage paths are outdated or missing. Regenerating...');
        await generateAndCachePaths(config, tokenDatabase);
    } else {
        log('Arbitrage paths are up to date.');
    }

    // Load the generated paths
    const pathsData = await fs.readFile(pathsPath, 'utf-8');
    const paths = JSON.parse(pathsData);

    log(`Loaded ${paths.length} arbitrage paths.`);

    // Graceful shutdown handling
    process.on('SIGINT', () => {
        log('Shutting down...');
        process.exit();
    });

    process.on('SIGTERM', () => {
        log('Shutting down...');
        process.exit();
    });

    try {
        await startScanning(paths, tokenDatabase);
    } catch (error) {
        log(`An unexpected error occurred in the main loop: ${error.message}`);
        log('Restarting in 10 seconds...');
        await sleep(10000);
        main(); // Restart the bot
    }
}

main();
