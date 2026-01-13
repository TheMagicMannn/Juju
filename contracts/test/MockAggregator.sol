// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockAggregator {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external {
        // Transfer the input tokens from the caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        // Transfer the output tokens to the caller
        IERC20(tokenOut).transfer(msg.sender, amountOut);
    }
}
