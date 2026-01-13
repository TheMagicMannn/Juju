require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load and validate the configuration
function loadConfig() {
    const configPath = path.join(__dirname, '../config/config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('Configuration file not found at ' + configPath);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Environment variables
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('PRIVATE_KEY is not set in the .env file.');
    }

    const network = process.env.NETWORK || 'base';
    if (!['base', 'baseSepolia'].includes(network)) {
        throw new Error(`Invalid NETWORK specified in .env: ${network}`);
    }

    const rpcUrl = network === 'base' ? process.env.BASE_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL;
    if (!rpcUrl) {
        throw new Error(`RPC URL for ${network} is not set in the .env file.`);
    }

    // API Keys
    const dexScreenerApiKey = process.env.DEXSCREENER_API_KEY;
    const oneInchApiKey = process.env.ONEINCH_API_KEY;

    // Merge and export the final configuration object
    return {
        ...config,
        network,
        rpcUrl,
        auth: {
            privateKey,
        },
        apiKeys: {
            dexScreener: dexScreenerApiKey,
            oneInch: oneInchApiKey,
        },
    };
}

module.exports = loadConfig();
