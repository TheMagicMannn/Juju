const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AaveV3BaseSepolia } = require('@bgd-labs/aave-address-book');
const { impersonateAccount, stopImpersonatingAccount, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("BaseAlphaArb", function () {
    async function deployFixture() {
        const [owner, otherAccount] = await ethers.getSigners();

        // Forking Base mainnet for real contract instances
        const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const usdc = await ethers.getContractAt("IERC20", usdcAddress);

        // Impersonate Aave Pool to initiate the flash loan
        await impersonateAccount(AaveV3BaseSepolia.POOL);
        const aavePool = await ethers.getSigner(AaveV3BaseSepolia.POOL);

        // Deploy our BaseAlphaArb contract
        const BaseAlphaArb = await ethers.getContractFactory("BaseAlphaArb");
        const baseAlphaArb = await BaseAlphaArb.deploy(AaveV3BaseSepolia.POOL_ADDRESSES_PROVIDER);
        await baseAlphaArb.waitForDeployment();

        // Deploy the MockAggregator
        const MockAggregator = await ethers.getContractFactory("MockAggregator");
        const mockAggregator = await MockAggregator.deploy();
        await mockAggregator.waitForDeployment();

        return { baseAlphaArb, owner, usdc, aavePool, mockAggregator };
    }

    it("Should execute a flash loan, perform a swap, and repay the loan with profit", async function () {
        const { baseAlphaArb, owner, usdc, aavePool, mockAggregator } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
        const premium = (loanAmount * 9n) / 10000n; // 0.09% Aave V3 premium
        const profit = ethers.parseUnits("100", 6); // 100 USDC profit

        // The mock aggregator needs to hold the profit amount to simulate a profitable trade
        // We will impersonate a USDC whale to fund the aggregator
        const usdcWhaleAddress = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
        await impersonateAccount(usdcWhaleAddress);
        const usdcWhale = await ethers.getSigner(usdcWhaleAddress);
        await usdc.connect(usdcWhale).transfer(await mockAggregator.getAddress(), loanAmount + profit);
        await stopImpersonatingAccount(usdcWhaleAddress);

        const wethAddress = "0x4200000000000000000000000000000000000006";
        const expectedProfit = ethers.parseUnits("0.1", 18); // 0.1 WETH

        // Prepare the calldata for the swap on the mock aggregator
        const swapData = mockAggregator.interface.encodeFunctionData("swap", [
            await usdc.getAddress(),
            wethAddress,
            loanAmount,
            expectedProfit
        ]);

        // Prepare the params for our contract's executeOperation
        const params = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'bytes'],
            [await mockAggregator.getAddress(), swapData]
        );

        // The flash loan will be initiated by the Aave Pool (impersonated)
        // This will call our contract's `executeOperation` function
        const flashLoanTx = await aavePool.flashLoanSimple(
            await baseAlphaArb.getAddress(), // receiverAddress
            await usdc.getAddress(),      // asset
            loanAmount,                   // amount
            params,                       // params
            0                             // referralCode
        );

        // Check the final state
        // The contract should have paid back the loan + premium and kept the profit
        const finalContractBalance = await usdc.balanceOf(await baseAlphaArb.getAddress());
        expect(finalContractBalance).to.equal(profit);

        // The owner (bot operator) should be able to withdraw the profit
        const initialOwnerBalance = await usdc.balanceOf(owner.address);
        await baseAlphaArb.connect(owner).withdraw(await usdc.getAddress());
        const finalOwnerBalance = await usdc.balanceOf(owner.address);
        expect(finalOwnerBalance - initialOwnerBalance).to.equal(profit);
    });
});
