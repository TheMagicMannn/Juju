const { ethers } = require('ethers');
const config = require('./config');
const { log, sleep, withErrorHandling } = require('./utils');
const { scanAllHubs } = require('./opportunityScanner');
const aggregatorService = require('./aggregatorService');
const { sendPrivateTransaction } = require('./mevProtection');

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.auth.privateKey, provider);

const POLLING_INTERVAL = 4000; // 4 seconds

/**
 * Handles a profitable opportunity by preparing and executing the transaction.
 * @param {object} opportunity The profitable opportunity.
 */
async function handleOpportunity(opportunity) {
    log(`Handling opportunity: ${opportunity.fromToken.symbol} -> ${opportunity.toToken.symbol} via ${opportunity.aggregator}`);

    const { swapData } = opportunity;

    if (!swapData || !swapData.tx) {
        log('Invalid swap data for opportunity.');
        return;
    }

    // Prepare the transaction for our smart contract
    const contractAddress = config.contractAddress[config.network];
    const contract = new ethers.Contract(contractAddress, [
        'function executeArb(address asset, uint256 amount, address aggregator, bytes calldata swapData)',
    ], wallet);

    const tx = await contract.populateTransaction.executeArb(
        opportunity.fromToken.address,
        opportunity.fromTokenAmount,
        swapData.tx.to, // The aggregator's router address
        swapData.tx.data
    );

    tx.gasLimit = BigInt(swapData.tx.gas) * 2n; // Add a buffer to the gas limit

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
 */
async function startScanning() {
    log('Starting scanner...');
    while (true) {
        const opportunities = await scanAllHubs();
        if (opportunities && opportunities.length > 0) {
            for (const opportunity of opportunities) {
                await handleOpportunity(opportunity);
            }
        }
        await sleep(POLLING_INTERVAL);
    }
}

/**
 * The main entry point for the bot.
 */
async function main() {
    log('Starting BaseAlphaBot...');

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
        await startScanning();
    } catch (error) {
        log(`An unexpected error occurred in the main loop: ${error.message}`);
        log('Restarting in 10 seconds...');
        await sleep(10000);
        main(); // Restart the bot
    }
}

main();
