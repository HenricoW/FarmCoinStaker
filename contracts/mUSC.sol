// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 Reward token for staking in FarmStaker contract
 */

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

 contract mUSC is ERC20 {
     constructor () ERC20("Mock USDC", "mUSDC") {}

     function faucet(uint amount) external {
         _mint(msg.sender, amount);
     }

     function decimals() override public pure returns(uint8){
         return 6;
     }
 }