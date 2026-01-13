const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const { getVolatileTokens } = require('./tokenManager');
const aggregatorService = require('./aggregatorService');
const dexService = require('./dexService');
const { calculateNetProfit, isProfitable, simulateTransaction, estimateGasCost } = require('./profitCalculator');


/**
 * Generates triangular and multi-hop trading paths.
 * @param {string} hub The hub asset.
 * @param {Array<object>} volatiles The list of volatile tokens.
 * @returns {Array<Array<string>>} A list of trading paths.
 */
function generatePaths(hub, volatiles) {
    const paths = [];
    // Simple triangular paths for now: Hub -> Volatile -> Hub
    volatiles.forEach(volatile => {
        paths.push([hub, volatile.symbol, hub]);
    });
    // More complex multi-hop paths can be generated here.
    return paths;
}


/**
 * Finds the best quotes from all aggregators for a given trading path.
 * @param {Array<string>} path The trading path.
 * @param {string} amountIn The amount to trade.
 * @returns {Promise<Array<object>>} A list of quotes from the aggregators.
 */
async function findBestQuotes(path, amountIn) {
    const [from, to] = path;
    const quotes = await Promise.all([
        aggregatorService.get1inchQuote(from, to, amountIn),
        aggregatorService.getOdosQuote(from, to, amountIn),
        aggregatorService.getCowQuote(from, to, amountIn),
        dexService.getUniswapQuote(from, to, amountIn),
        dexService.getAerodromeQuote(from, to, amountIn),
        dexService.getPancakeSwapQuote(from, to, amountIn),
    ]);
    return quotes.filter(q => q); // Filter out any failed quotes
}


/**
 * Checks for consensus among the aggregator quotes.
 * Requires at least 2/3 of aggregators to agree on the route and output.
 * @param {Array<object>} quotes The list of quotes.
 * @returns {object|null} The consensus quote or null if no consensus is reached.
 */
function checkConsensus(quotes, consensusThreshold = 2 / 3, tolerance = 0.01) {
    if (quotes.length === 0) {
        return null;
    }

    // Sort quotes from best to worst based on output amount
    quotes.sort((a, b) => BigInt(b.toTokenAmount) < BigInt(a.toTokenAmount) ? -1 : 1);

    const bestQuote = quotes[0];
    const bestAmount = BigInt(bestQuote.toTokenAmount);

    // Find how many other quotes are within the tolerance of the best quote
    const agreeingQuotes = quotes.filter(q => {
        const amount = BigInt(q.toTokenAmount);
        const difference = bestAmount > amount ? bestAmount - amount : amount - bestAmount;
        const percentageDifference = Number(difference * 10000n / bestAmount) / 10000;
        return percentageDifference <= tolerance;
    });

    // Check if the number of agreeing quotes meets the consensus threshold
    if (agreeingQuotes.length / quotes.length >= consensusThreshold) {
        log(`Consensus reached: ${agreeingQuotes.length}/${quotes.length} aggregators agree.`);
        return bestQuote;
    }

    log(`No consensus: only ${agreeingQuotes.length}/${quotes.length} aggregators agreed.`);
    return null;
}


/**
 * Evaluates a potential arbitrage opportunity.
 * @param {object} quote The consensus quote.
 * @param {string} hub The hub asset.
 * @returns {Promise<object|null>} The profitable opportunity or null.
 */
async function evaluateOpportunity(quote, hub) {
    let swapData;
    if (quote.aggregator === '1inch') {
        swapData = await aggregatorService.get1inchSwap(
            quote.fromToken.address,
            quote.toToken.address,
            quote.fromTokenAmount,
            config.contractAddress.base, // The address of our contract
            config.slippageBuffer
        );
    } else if (quote.aggregator === 'odos') {
        swapData = await aggregatorService.getOdosAssemble(quote);
    } else if (quote.aggregator === 'cowswap') {
        // CoW Swap execution logic is not implemented.
        // It uses a different off-chain signing mechanism (EIP-712) rather than a simple transaction.
        // A full implementation would require a separate flow to create and sign a CoW Swap order.
        return null;
    } else if (quote.dex === 'uniswap') {
        swapData = await dexService.getUniswapSwapData(
            quote.fromToken.address,
            quote.toToken.address,
            quote.fromTokenAmount,
            quote.toTokenAmount, // amountOutMinimum
            quote.fee
        );
    } else if (quote.dex === 'aerodrome') {
        swapData = await dexService.getAerodromeSwapData(
            quote.fromToken.address,
            quote.toToken.address,
            quote.fromTokenAmount,
            quote.toTokenAmount // amountOutMinimum
        );
    } else if (quote.dex === 'pancakeswap') {
        swapData = await dexService.getPancakeSwapSwapData(
            quote.fromToken.address,
            quote.toToken.address,
            quote.fromTokenAmount,
            quote.toTokenAmount, // amountOutMinimum
            quote.fee
        );
    }

    if (!swapData) {
        return null;
    }

    // Create the transaction object to estimate gas
    const contract = new ethers.Contract(config.contractAddress.base, [
        'function executeArb(address asset, uint256 amount, address aggregator, bytes calldata swapData)',
    ]);
    const tx = await contract.populateTransaction.executeArb(
        quote.fromToken.address,
        quote.fromTokenAmount,
        swapData.tx.to,
        swapData.tx.data
    );

    const gasEstimate = await estimateGasCost(tx);

    const { netProfit } = calculateNetProfit(
        BigInt(quote.toTokenAmount),
        BigInt(quote.fromTokenAmount),
        gasEstimate
    );

    if (await isProfitable(netProfit, `${quote.fromToken.symbol}/${quote.toToken.symbol}`)) {
        if (await simulateTransaction(config.contractAddress[config.network], swapData.tx.data)) {
            return { ...quote, netProfit, swapData };
        }
    }
    return null;
}


/**
 * Scans all hub assets for arbitrage opportunities.
 * @returns {Promise<Array<object>>} A list of profitable opportunities.
 */
async function scanAllHubs() {
    log('Scanning for arbitrage opportunities...');
    const opportunities = [];
    const volatiles = getVolatileTokens();

    for (const hub of config.hubAssets) {
        const paths = generatePaths(hub, volatiles);
        for (const path of paths) {
            const amountIn = ethers.parseUnits(config.scanAmount, 'ether').toString();

            const quotes = await findBestQuotes(path, amountIn);
            const consensusQuote = checkConsensus(quotes);

            if (consensusQuote) {
                const opportunity = await evaluateOpportunity(consensusQuote, hub);
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            }
        }
    }

    log(`Found ${opportunities.length} profitable opportunities.`);
    return opportunities;
}

module.exports = {
    scanAllHubs: withErrorHandling(scanAllHubs),
};
