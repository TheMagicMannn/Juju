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

    it("Should execute a two-hop flash loan and repay with profit", async function () {
        const { baseAlphaArb, owner, usdc, aavePool, mockAggregator } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
        const profit = ethers.parseUnits("100", 6); // 100 USDC profit

        // Fund the mock aggregator to simulate a profitable trade
        const usdcWhaleAddress = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
        await impersonateAccount(usdcWhaleAddress);
        const usdcWhale = await ethers.getSigner(usdcWhaleAddress);
        await usdc.connect(usdcWhale).transfer(await mockAggregator.getAddress(), loanAmount + profit);
        await stopImpersonatingAccount(usdcWhaleAddress);

        const wethAddress = "0x4200000000000000000000000000000000000006";
        const intermediateAmount = ethers.parseUnits("5", 18); // 5 WETH

        // Path: USDC -> WETH -> USDC
        const tokens = [usdc.target, wethAddress, usdc.target];

        // Prepare the calldata for the swaps on the mock aggregator
        const hop1Data = mockAggregator.interface.encodeFunctionData("swap", [usdc.target, wethAddress, loanAmount, intermediateAmount]);
        const hop2Data = mockAggregator.interface.encodeFunctionData("swap", [wethAddress, usdc.target, intermediateAmount, loanAmount + profit]);

        const hops = [
            { target: mockAggregator.target, data: hop1Data },
            { target: mockAggregator.target, data: hop2Data },
        ];

        // Fund aggregator with WETH to perform the first swap
        await owner.sendTransaction({ to: wethAddress, value: ethers.parseEther("10") }); // Get some WETH
        const weth = await ethers.getContractAt("IWETH", wethAddress);
        await weth.connect(owner).transfer(mockAggregator.target, intermediateAmount);

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
