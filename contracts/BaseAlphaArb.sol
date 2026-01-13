// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BaseAlphaArb
 * @author Jules
 * @notice This contract executes arbitrage trades on Base network using Aave V3 flash loans.
 * It is designed to be called by a trusted off-chain bot.
 */
contract BaseAlphaArb is FlashLoanSimpleReceiverBase, Ownable, Pausable, ReentrancyGuard {

    // Event to log the outcome of an arbitrage execution
    event ArbExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        bool success
    );

    // Event to log profit withdrawal
    event Withdrawn(address indexed token, uint256 amount);

    /**
     * @param poolProvider The address of the Aave V3 PoolAddressesProvider
     */
    constructor(address poolProvider)
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(poolProvider))
        Ownable(msg.sender)
    {}

    /**
     * @notice Initiates a flash loan and the subsequent arbitrage trade.
     * @dev Can only be called by the owner (the off-chain bot).
     * @param asset The address of the token to be borrowed.
     * @param amount The amount of the token to be borrowed.
     * @param aggregator The address of the DEX aggregator router to execute the swap.
     * @param swapData The calldata for the swap to be executed by the aggregator.
     */
    function executeArb(
        address asset,
        uint256 amount,
        address aggregator,
        bytes calldata swapData
    ) external onlyOwner whenNotPaused nonReentrant {
        bytes memory params = abi.encode(aggregator, swapData);

        POOL.flashLoanSimple(
            address(this), // receiverAddress
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    /**
     * @notice This function is called by the Aave V3 Pool after the flash loan is funded.
     * It executes the arbitrage trade and repays the loan.
     * @dev This function's execution is wrapped by the FlashLoanSimpleReceiverBase,
     * which ensures the loan is repaid.
     * @param asset The address of the token that was borrowed.
     * @param amount The amount of the token that was borrowed.
     * @param premium The fee charged by Aave for the flash loan.
     * @param initiator The address that initiated the flash loan (this contract).
     * @param params The encoded data passed from executeArb, containing aggregator and swapData.
     * @return A boolean indicating the success of the operation.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Not from Aave Pool");
        require(initiator == address(this), "Invalid initiator");

        // Decode parameters
        (address aggregator, bytes memory swapData) = abi.decode(params, (address, bytes));

        // 1. Approve the aggregator to spend the borrowed funds
        IERC20(asset).approve(aggregator, amount);

        // 2. Execute the multi-hop swap via the aggregator
        (bool success, ) = aggregator.call(swapData);
        require(success, "Swap failed");

        // 3. Check profit and emit event
        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        uint256 repayAmount = amount + premium;

        require(balanceAfter >= repayAmount, "Insufficient funds to repay loan");

        uint256 profit = balanceAfter - repayAmount;
        emit ArbExecuted(asset, amount, profit, true);

        return true;
    }

    /**
     * @notice Withdraws accumulated profit tokens from the contract.
     * @dev Can only be called by the owner.
     * @param token The address of the ERC20 token to withdraw.
     */
    function withdraw(address token) external onlyOwner {
        uint256 amount = IERC20(token).balanceOf(address(this));
        require(amount > 0, "No balance to withdraw");
        IERC20(token).transfer(owner(), amount);
        emit Withdrawn(token, amount);
    }

    /**
     * @notice Rescues ERC20 tokens that were accidentally sent to this contract.
     * @dev Can only be called by the owner.
     * @param token The address of the token to rescue.
     * @param amount The amount of tokens to rescue.
     */
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        IERC20(token).transfer(owner(), amount);
    }

    /**
     * @notice Pauses the contract, preventing new arbitrage executions.
     * @dev Can only be called by the owner.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract, re-enabling arbitrage executions.
     * @dev Can only be called by the owner.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Allows the contract to receive ETH.
     */
    receive() external payable {}
}
