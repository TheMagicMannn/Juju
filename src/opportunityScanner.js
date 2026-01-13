const { ethers } = require('ethers');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const aggregatorService = require('./aggregatorService');
const dexService = require('./dexService');
const { calculateNetProfit, isProfitable, simulateTransaction, estimateGasCost } = require('./profitCalculator');

/**
 * Gets the best quote for a single hop from all available DEXs and aggregators.
 * @param {string} fromToken The address of the token to sell.
 * @param {string} toToken The address of the token to buy.
 * @param {string} amountIn The amount to sell.
 * @param {string} preferredDex The DEX specified in the path.
 * @returns {Promise<object|null>} The best quote found.
 */
async function getBestHopQuote(fromToken, toToken, amountIn, preferredDex) {
    const quoteFunctions = {
        '1inch': (from, to, amount) => aggregatorService.get1inchQuote(from, to, amount),
        'odos': (from, to, amount) => aggregatorService.getOdosQuote(from, to, amount),
        'cowswap': (from, to, amount) => aggregatorService.getCowQuote(from, to, amount),
        'uniswap': (from, to, amount) => dexService.getUniswapQuote(from, to, amount),
        'aerodrome': (from, to, amount) => dexService.getAerodromeQuote(from, to, amount),
        'pancakeswap': (from, to, amount) => dexService.getPancakeSwapQuote(from, to, amount),
    };

    const quotes = [];
    if (quoteFunctions[preferredDex]) {
        quotes.push(await quoteFunctions[preferredDex](fromToken, toToken, amountIn));
    } else {
        log(`Warning: Unknown DEX '${preferredDex}' specified in path.`);
        // Fallback to all if the preferred one is not found or fails
        for (const fn of Object.values(quoteFunctions)) {
            quotes.push(await fn(fromToken, toToken, amountIn));
        }
    }

    const validQuotes = quotes.filter(q => q && q.toTokenAmount);
    if (validQuotes.length === 0) return null;

    // Return the quote with the highest output amount
    return validQuotes.reduce((best, current) =>
        BigInt(current.toTokenAmount) > BigInt(best.toTokenAmount) ? current : best
    );
}

/**
 * Evaluates a multi-hop arbitrage path for profitability.
 * @param {Array<object>} path The arbitrage path to evaluate.
 * @param {string} initialAmount The starting amount for the flash loan.
 * @returns {Promise<object|null>} A profitable opportunity object or null.
 */
async function evaluatePath(path, initialAmount) {
    let currentAmount = initialAmount;
    const executedHops = [];
    const tokens = [path[0].from];

    for (const hop of path) {
        const quote = await getBestHopQuote(hop.from, hop.to, currentAmount.toString(), hop.dex);
        if (!quote) {
            log(`No quote found for hop ${hop.from} -> ${hop.to}. Path evaluation failed.`);
            return null; // This hop is not viable, so the path fails
        }

        if (quote.aggregator === 'cowswap') {
            log(`Skipping path due to CoW Swap hop: ${hop.from} -> ${hop.to}.`);
            return null;
        }

        let swapData;
        if (quote.aggregator === 'odos') {
            swapData = await aggregatorService.getOdosAssemble(quote);
        } else if (quote.dex === 'uniswap') {
            swapData = await dexService.getUniswapSwapData(hop.from, hop.to, currentAmount, quote.toTokenAmount, quote.fee);
        } else if (quote.dex === 'aerodrome') {
            swapData = await dexService.getAerodromeSwapData(hop.from, hop.to, currentAmount, quote.toTokenAmount);
        } else if (quote.dex === 'pancakeswap') {
            swapData = await dexService.getPancakeSwapSwapData(hop.from, hop.to, currentAmount, quote.toTokenAmount, quote.fee);
        }

        if (!swapData || !swapData.tx) {
            log(`Failed to get swap data for hop ${hop.from} -> ${hop.to}.`);
            return null;
        }

        executedHops.push({ target: swapData.tx.to, data: swapData.tx.data });
        tokens.push(hop.to);
        currentAmount = BigInt(quote.toTokenAmount);
    }

    const finalAmount = currentAmount;
    const contract = new ethers.Contract(config.contractAddress.base, [
        'function executeArb(address[] calldata tokens, Hop[] calldata hops, uint256 amount)',
    ]);
    const tx = await contract.populateTransaction.executeArb(tokens, executedHops, initialAmount);
    const gasEstimate = await estimateGasCost(tx);

    const { netProfit } = calculateNetProfit(finalAmount, BigInt(initialAmount), gasEstimate);

    if (isProfitable(netProfit, `${tokens[0]}/${tokens[tokens.length - 1]}`)) {
        if (await simulateTransaction(config.contractAddress[config.network], tx.data)) {
            return {
                netProfit,
                initialAmount,
                finalAmount,
                tokens,
                hops: executedHops,
            };
        }
    }
    return null;
}

/**
 * Scans all cached arbitrage paths for profitable opportunities.
 * @returns {Promise<Array<object>>} A list of profitable opportunities.
 */
async function scanAllPaths() {
    log('Scanning all cached paths for arbitrage opportunities...');
    const opportunities = [];
    const pathsPath = path.join(__dirname, '../config/paths.json');

    try {
        const data = await fs.readFile(pathsPath, 'utf8');
        const paths = JSON.parse(data);
        const initialAmount = ethers.parseUnits(config.scanAmount, 'ether').toString(); // Example: 1 WETH

        for (const path of paths) {
            if (!path || path.length === 0) continue;
            const opportunity = await evaluatePath(path, initialAmount);
            if (opportunity) {
                opportunities.push(opportunity);
                log(`Found profitable opportunity: ${opportunity.netProfit.toString()} profit.`);
            }
        }
    } catch (error) {
        log(`Error scanning paths: ${error.message}`);
    }

    log(`Found ${opportunities.length} total profitable opportunities.`);
    return opportunities;
}

module.exports = {
    scanAllPaths: withErrorHandling(scanAllPaths),
};
