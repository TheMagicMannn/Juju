const { ethers } = require('ethers');

/**
 * Logs a message with a timestamp.
 * @param {string} message The message to log.
 */
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * A simple sleep utility.
 * @param {number} ms The number of milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely adds two BigNumber values.
 * @param {ethers.BigNumber} a The first value.
 * @param {ethers.BigNumber} b The second value.
 * @returns {ethers.BigNumber} The sum of the two values.
 */
function safeAdd(a, b) {
    return a.add(b);
}

/**
 * Safely subtracts two BigNumber values.
 * @param {ethers.BigNumber} a The first value.
 * @param {ethers.BigNumber} b The second value.
 * @returns {ethers.BigNumber} The difference of the two values.
 */
function safeSub(a, b) {
    return a.sub(b);
}

/**
 * A simple error handling wrapper for async functions.
 * @param {Function} fn The async function to wrap.
 * @returns {Function} The wrapped function.
 */
function withErrorHandling(fn) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            log(`Error in ${fn.name}: ${error.message}`);
            // Depending on the desired behavior, you might want to re-throw the error
            // or handle it in a specific way (e.g., send a notification).
        }
    };
}

module.exports = {
    log,
    sleep,
    safeAdd,
    safeSub,
    withErrorHandling,
};
