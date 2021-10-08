// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 Reward token for staking in FarmStaker contract
 */

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

 contract FarmCoin is ERC20 {
     constructor () ERC20("FarmCoin", "FCT") {}
 }