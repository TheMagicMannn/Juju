const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const { isHighConviction } = require('./zScoreEngine');

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const AAVE_PREMIUM = 0.0009; // Aave V3 flash loan premium is 0.09%

/**
 * Calculates the net profit of a potential arbitrage trade.
 * @param {BigInt} grossOutput The gross output from the trade.
 * @param {BigInt} borrowedAmount The amount borrowed in the flash loan.
 * @param {BigInt} gasEstimate The estimated gas cost in the hub token.
 * @returns {object} An object containing the net profit and other details.
 */
function calculateNetProfit(grossOutput, borrowedAmount, gasEstimate) {
    // Using BigInt for calculations. AAVE_PREMIUM is 0.09%, so we multiply by 9 and divide by 10000.
    const premium = (borrowedAmount * 9n) / 10000n;
    const repayAmount = borrowedAmount + premium;

    // Adjust for slippage. slippageBuffer is a float like 0.001.
    const slippageFactor = BigInt(Math.round((1 - config.slippageBuffer) * 10000));
    const slippageAdjustedOutput = (grossOutput * slippageFactor) / 10000n;

    const netProfit = slippageAdjustedOutput - repayAmount - gasEstimate;

    // Calculate profit percentage, scaled by 10000 for precision.
    const profitPercent = (netProfit * 10000n) / borrowedAmount;

    return {
        netProfit,
        profitPercent: Number(profitPercent) / 100, // Convert back to percentage
        repayAmount,
        premium,
    };
}


/**
 * Determines if a trade is profitable based on a dynamic threshold.
 * @param {BigInt} netProfit The net profit of the trade.
 * @param {string} pair The token pair for the Z-score check.
 * @returns {Promise<boolean>} True if the trade is profitable, false otherwise.
 */
async function isProfitable(netProfit, pair) {
    let threshold = ethers.parseUnits(config.profitThreshold.toString(), 'ether');

    if (await isHighConviction(pair)) {
        // Boost the threshold for high-conviction trades
        threshold = threshold * 2n; // Example: double the threshold
        log(`High-conviction opportunity for ${pair}. Applying boosted profit threshold.`);
    }

    return netProfit > threshold;
}

/**
 * Simulates a transaction off-chain to verify its outcome.
 * @param {string} contractAddress The address of the contract to call.
 * @param {string} calldata The transaction calldata.
 * @returns {Promise<boolean>} True if the simulation is successful, false otherwise.
 */
async function simulateTransaction(contractAddress, calldata) {
    log('Simulating transaction off-chain...');
    try {
        await provider.call({
            to: contractAddress,
            data: calldata,
        });
        log('Transaction simulation successful.');
        return true;
    } catch (error) {
        log(`Transaction simulation failed: ${error.message}`);
        return false;
    }
}

/**
 * Estimates the gas cost of a transaction.
 * @param {ethers.TransactionRequest} tx The transaction object.
 * @returns {Promise<BigInt>} The estimated gas cost in the native token.
 */
async function estimateGasCost(tx) {
    const [gasLimit, feeData] = await Promise.all([
        provider.estimateGas(tx),
        provider.getFeeData()
    ]);
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
    return gasLimit * gasPrice;
}


module.exports = {
    calculateNetProfit,
    isProfitable: withErrorHandling(isProfitable),
    simulateTransaction: withErrorHandling(simulateTransaction),
    estimateGasCost: withErrorHandling(estimateGasCost),
};
