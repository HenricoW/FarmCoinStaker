// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import { StakeLocker } from './StakeLocker.sol';

contract FarmCoinStaker is Ownable {
    address public farmCoinAddress;     // address of the reward token
    address public stakeTokenAddress;   // address of the stake token (USDC)
    uint public rewardsBalance;         // total pool tokens available as staking rewards

    uint public rewardsStartTime;       // time staking started (contract funded the 1st time)
    uint public rewardsEndTime;         // time staking ends
    uint public rewardsDurationDays;    // amount of days staking will be allowed after contract is funded the 1st time
    ContractPhase public stakePhase;    // contract stake phase

    // keep record of the locker contracts
    string[] public lockerTypes;        // locker type names
    mapping(string => StakeLocker) public stakeLockers; // type name => locker

    // INITIALIZED - tokens set, contract not funded
    // ACTIVE - contract funded, users can stake
    // ENDED - users can no longer stake, only unstake
    enum ContractPhase {
        INITIALIZED,
        ACTIVE,
        ENDED
    }


    constructor(address _farmCoinAddress, address _stakeTokenAddress, uint64 _rewardDurationDays) {
        stakePhase = ContractPhase.INITIALIZED;
        farmCoinAddress = _farmCoinAddress;
        stakeTokenAddress = _stakeTokenAddress;
        rewardsDurationDays = _rewardDurationDays;

        // create a locker with no lockup (special case), others added with 'createLocker'
    }


    function fundContract(uint rewardFundAmount) external onlyOwner {
        rewardsBalance += rewardFundAmount;

        if(stakePhase == ContractPhase.INITIALIZED) {
            rewardsStartTime = block.timestamp;
            rewardsEndTime = rewardsStartTime + (rewardsDurationDays * 1 days);
            stakePhase = ContractPhase.ACTIVE;
        }

        bool success = IERC20(farmCoinAddress).transferFrom(msg.sender, address(this), rewardFundAmount);
        require(success, "FarmStaker#fundContract: Farm coin transfer failed"); // may be unnecessary
    }

    // create a locker contract 
    function createLocker(string memory lockerName, uint lockDurationDays, uint rewardRate, uint penaltyRate) external onlyOwner {}

    // stake to a specified locker contract (calls stake on that locker)
    function stake(string memory lockerName, uint amountUSDC) external {}

    // unstake from a specified locker contract (calls unstake on that locker)
    function unstake(string memory lockerName, uint amountUSDC) external {}

    // HELPERS
    // ---------
    // get all locker types
    function getLockerNames() external view returns(string[] memory) {}
    // get total staked accross all lockers
    function allLockerStaked() external view returns(uint) {}

    // get total claimed accross all lockers
    function allLockerClaimed() external view returns(uint) {}
}