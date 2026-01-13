const { ethers } = require("ethers");
require('dotenv').config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const usdc = new ethers.Contract(usdcAddress, [
        "event Transfer(address indexed from, address indexed to, uint256 value)",
    ], provider);

    const filter = usdc.filters.Transfer();
    const logs = await usdc.queryFilter(filter, -100); // Get the last 100 transfer logs

    // Find a large transfer
    let whaleAddress = "";
    let maxAmount = 0n;
    for (const log of logs) {
        if (log.args.value > maxAmount) {
            maxAmount = log.args.value;
            whaleAddress = log.args.from;
        }
    }

    console.log(`Found whale address: ${whaleAddress}`);
}

main().catch(console.error);
