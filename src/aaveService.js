const { ethers } = require('ethers');
const { AaveV3Base } = require('@bgd-labs/aave-address-book');
const { loadBalancer } = require('./provider');
const { withErrorHandling } = require('./utils');

const poolContract = new ethers.Contract(AaveV3Base.POOL, [
    'function getReservesList() external view returns (address[] memory)'
], loadBalancer.getNextProvider());

/**
 * Fetches the list of all reservable assets from the Aave V3 Pool.
 * These are the assets that can be used for flash loans.
 * @returns {Promise<Array<string>>} A list of asset addresses.
 */
async function getFlashLoanableAssets() {
    console.log('Fetching flash loanable assets from Aave V3...');
    const assets = await poolContract.getReservesList();
    console.log(`Found ${assets.length} flash loanable assets.`);
    return assets;
}

module.exports = {
    getFlashLoanableAssets: withErrorHandling(getFlashLoanableAssets),
};
