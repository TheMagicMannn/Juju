const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AaveV3Base } = require('@bgd-labs/aave-address-book');
const { impersonateAccount, stopImpersonatingAccount, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("BaseAlphaArb Multi-Hop", function () {
    async function deployFixture() {
        const [owner] = await ethers.getSigners();

        const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const wethAddress = "0x4200000000000000000000000000000000000006";
        const usdc = await ethers.getContractAt("IERC20", usdcAddress);
        const weth = await ethers.getContractAt("IWETH", wethAddress);

        await impersonateAccount(AaveV3Base.POOL);
        const aavePool = await ethers.getSigner(AaveV3Base.POOL);

        const BaseAlphaArb = await ethers.getContractFactory("BaseAlphaArb");
        const baseAlphaArb = await BaseAlphaArb.deploy(AaveV3Base.POOL_ADDRESSES_PROVIDER);
        await baseAlphaArb.waitForDeployment();

        const MockAggregator = await ethers.getContractFactory("MockAggregator");
        const aggregator1 = await MockAggregator.deploy();
        const aggregator2 = await MockAggregator.deploy();
        await Promise.all([aggregator1.waitForDeployment(), aggregator2.waitForDeployment()]);

        return { baseAlphaArb, owner, usdc, weth, aavePool, aggregator1, aggregator2 };
    }

    it("Should execute a multi-hop flash loan and repay with profit", async function () {
        const { baseAlphaArb, owner, usdc, weth, aavePool, aggregator1, aggregator2 } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
        const profit = ethers.parseUnits("100", 6); // 100 USDC profit

        // Fund the mock aggregators to simulate a profitable trade
        const usdcWhaleAddress = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
        await impersonateAccount(usdcWhaleAddress);
        const usdcWhale = await ethers.getSigner(usdcWhaleAddress);
        await usdc.connect(usdcWhale).transfer(await aggregator2.getAddress(), loanAmount + profit);
        await stopImpersonatingAccount(usdcWhaleAddress);

        // Path: USDC -> WETH (via Odos) -> USDC (via Uniswap)
        const tokens = [usdc.target, weth.target, usdc.target];
        const intermediateAmount = ethers.parseUnits("5", 18); // 5 WETH

        // For the purpose of this test, we'll use the mock aggregators to represent Odos and Uniswap
        const odosRouter = aggregator1;
        const uniswapRouter = aggregator2;

        const hop1Data = odosRouter.interface.encodeFunctionData("swap", [usdc.target, weth.target, loanAmount, intermediateAmount]);
        const hop2Data = uniswapRouter.interface.encodeFunctionData("swap", [weth.target, usdc.target, intermediateAmount, loanAmount + profit]);

        const hops = [
            { target: odosRouter.target, data: hop1Data },
            { target: uniswapRouter.target, data: hop2Data },
        ];

        // Fund Odos router with WETH to perform the first swap
        await owner.sendTransaction({ to: weth.target, value: ethers.parseEther("10") }); // Get some WETH
        await weth.connect(owner).transfer(odosRouter.target, intermediateAmount);

        // The Aave Pool (impersonated) will initiate the flash loan
        const flashLoanTx = await baseAlphaArb.connect(aavePool).executeOperation(
            usdc.target,
            loanAmount,
            (loanAmount * 9n) / 10000n,
            baseAlphaArb.target,
            ethers.AbiCoder.defaultAbiCoder().encode(['address[]', 'tuple(address,bytes)[]'], [tokens, hops])
        );
        await flashLoanTx.wait();

        const finalContractBalance = await usdc.balanceOf(baseAlphaArb.target);
        expect(finalContractBalance).to.equal(profit);
    });
});
