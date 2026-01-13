const axios = require('axios');
const { log, withErrorHandling } = require('./utils');

const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/';

/**
 * Fetches all trading pairs for a given set of DEX addresses from DexScreener.
 * @param {Array<string>} dexIds An array of DEX identifiers (e.g., 'uniswap', 'aerodrome').
 * @returns {Promise<object>} A comprehensive database of tokens and their pairs.
 */
async function fetchAllPairs(dexIds) {
    const tokenDatabase = {};
    log(`Fetching all pairs for DEXs: ${dexIds.join(', ')}...`);

    for (const dexId of dexIds) {
        try {
            // DexScreener API can be slow, so we'll fetch page by page
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                // Corrected endpoint using search functionality
                const query = `${dexId} pairs on base`;
                const url = `${DEXSCREENER_API_URL}search?q=${encodeURIComponent(query)}&page=${page}`;
                const response = await axios.get(url);
                const { pairs } = response.data;

                if (!pairs || pairs.length === 0) {
                    hasMore = false;
                    continue;
                }

                log(`Fetched page ${page} with ${pairs.length} pairs for ${dexId}...`);

                for (const pair of pairs) {
                    const { baseToken, quoteToken, liquidity } = pair;
                    if (!baseToken || !quoteToken || !liquidity || !liquidity.usd) continue;

                    // Add tokens to the database if they don't exist
                    [baseToken, quoteToken].forEach(token => {
                        if (!tokenDatabase[token.address]) {
                            tokenDatabase[token.address] = {
                                symbol: token.symbol,
                                name: token.name,
                                pairs: {},
                                liquidity: 0,
                            };
                        }
                    });

                    // Add pair information to each token
                    tokenDatabase[baseToken.address].pairs[quoteToken.address] = { dex: dexId };
                    tokenDatabase[quoteToken.address].pairs[baseToken.address] = { dex: dexId };

                    // Aggregate liquidity
                    tokenDatabase[baseToken.address].liquidity += liquidity.usd;
                    tokenDatabase[quoteToken.address].liquidity += liquidity.usd;
                }

                page++;
            }
        } catch (error) {
            log(`Failed to fetch pairs for ${dexId}: ${error.message}`);
        }
    }

    log(`Built database with ${Object.keys(tokenDatabase).length} tokens.`);
    return tokenDatabase;
}

module.exports = {
    fetchAllPairs: withErrorHandling(fetchAllPairs),
};
