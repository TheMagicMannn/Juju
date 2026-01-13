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

    const rpcUrls = network === 'base'
        ? (process.env.BASE_RPC_URLS ? process.env.BASE_RPC_URLS.split(',') : [])
        : [process.env.BASE_SEPOLIA_RPC_URL];

    if (!rpcUrls || rpcUrls.length === 0 || !rpcUrls[0]) {
        throw new Error(`RPC URLs for ${network} are not set in the .env file.`);
    }

    // API Keys
    const dexScreenerApiKey = process.env.DEXSCREENER_API_KEY;

    // Merge and export the final configuration object
    return {
        ...config,
        network,
        rpcUrls,
        auth: {
            privateKey,
        },
        apiKeys: {
            dexScreener: dexScreenerApiKey,
        },
    };
}

module.exports = loadConfig();
