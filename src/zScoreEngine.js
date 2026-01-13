const axios = require('axios');
const { log, withErrorHandling } = require('./utils');
const { getPairAddress } = require('./tokenManager');

const dexScreenerApi = axios.create({
    baseURL: 'https://api.dexscreener.com/latest/',
});

/**
 * Fetches historical price data for a token pair from DexScreener.
 * @param {string} pairAddress The address of the token pair.
 * @returns {Promise<Array<number>>} A list of historical prices.
 */
const getHistoricalData = async (pairAddress) => {
    log(`Fetching historical data for pair ${pairAddress}...`);
    try {
        const response = await dexScreenerApi.get(`pairs/base/${pairAddress}`);
        // This is a simplified approach. A more robust implementation would handle
        // different timeframes and data resolutions.
        // We will use the price history from the last 24 hours.
        const prices = response.data.pair.priceHistory24h.map(p => p.priceUsd);
        return prices;
    } catch (error) {
        log(`Failed to fetch historical data for ${pairAddress}: ${error.message}`);
        return null;
    }
};

/**
 * Computes the Z-score for a given token pair.
 * z = (current_spread - mean_spread) / std_dev
 * @param {string} pair The token pair (e.g., "WETH/USDC").
 * @param {number} window The rolling window size for the calculation.
 * @returns {Promise<number|null>} The Z-score or null if it cannot be computed.
 */
const computeZScore = async (pair, window = 100) => {
    const [token0Symbol, token1Symbol] = pair.split('/');
    const pairAddress = await getPairAddress(token0Symbol, token1Symbol);
    if (!pairAddress) {
        return null;
    }

    const historicalData = await getHistoricalData(pairAddress);
    if (!historicalData || historicalData.length < 2) {
        return null;
    }

    const currentPrice = historicalData[historicalData.length - 1];

    // Calculate the mean
    const sum = historicalData.reduce((acc, val) => acc + val, 0);
    const mean = sum / historicalData.length;

    // Calculate the standard deviation
    const squaredDiffs = historicalData.map(val => (val - mean) ** 2);
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / historicalData.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
        return 0; // Avoid division by zero
    }

    const zScore = (currentPrice - mean) / stdDev;
    return zScore;
};

/**
 * Checks if a token pair represents a high-conviction opportunity based on its Z-score.
 * @param {string} pair The token pair.
 * @param {number} threshold The Z-score threshold for a high-conviction signal.
 * @returns {Promise<boolean>} True if it's a high-conviction opportunity, false otherwise.
 */
const isHighConviction = async (pair, threshold = 2.5) => {
    const zScore = await computeZScore(pair);
    if (zScore === null) {
        return false;
    }
    return Math.abs(zScore) > threshold;
};


module.exports = {
    computeZScore: withErrorHandling(computeZScore),
    isHighConviction: withErrorHandling(isHighConviction),
};
