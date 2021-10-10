// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/access/Ownable.sol';

/**
* @notice For creating stake locking contracts. Only owner can make state changes
*/
contract StakeLocker is Ownable {
    uint public lockDuration;
    uint public rewardRate;             // in percent - rate of reward for staking
    uint public penaltyRate;            // in percent - penalty for early unstake

    uint public totalStaked;            // cumulative total USDC staked
    uint public totRewardsClaimed;      // cumulative total farm coin claimed
    uint public constant ONEYEAR = 365 days;
    
    address[] private userAddresses;
    mapping(address => Record) userRecords;

    struct Record {
        uint stakeBal;              // current stake balance
        uint priorStakeTime;        // timestamp of when last stake started
        uint unclaimedReward;       // to not wipe out rewards if staking after 1st stake matured & didn't claim
    }

    /**
     * @notice Constructor: Sets up new stake lock contract
     * @param _lockDurationInDays   - number of days this contract locks up stakes
     * @param _rewardRate           - reward APY, in percent 
     * @param _penaltyRate          - penalty for early unstake, in percent
     */
    constructor(uint _lockDurationInDays, uint _rewardRate, uint _penaltyRate) {
        lockDuration = _lockDurationInDays * 1 days;
        rewardRate = _rewardRate;
        penaltyRate = _penaltyRate;
    }

    // transfers are done in the main contract, which holds all funds, this contract only tracks this locker's users' stake state
    function stake(uint amount, address user) external onlyOwner {
        Record memory userRec = userRecords[user];

        // if already staked
        uint calculatedReward;
        if(userRec.priorStakeTime > 0) {
            // if not matured, revert
            require(block.timestamp > userRec.priorStakeTime + lockDuration, "StakeLocker#stake: Already have a locked up stake that has not matured");

            // if matured, not claimed but staking, calc reward so it doesn't get wiped out
            calculatedReward = calcReward(userRec.stakeBal, userRec.priorStakeTime);
        }

        // update totals
        totalStaked += amount;

        // if new staker add to user array
        if(userRec.priorStakeTime == 0) userAddresses.push(user);
        // create/update user record
        userRecords[user] = Record({
            stakeBal: userRec.stakeBal + amount,
            priorStakeTime: block.timestamp,
            unclaimedReward: userRec.unclaimedReward + calculatedReward
        });
    }

    // only does full unstakes
    // transfers are done in the main contract, which holds all funds, this contract only tracks this locker's users' stake state
    function unstakeAll(address user) external onlyOwner returns(uint, uint) {
        Record memory userRec = userRecords[user];
        // if no user record or nothing staked (has record, but all claimed), revert
        require(userRec.stakeBal > 0, "StakeLocker#unstake: Nothing to unstake");
        // if not after maturity, calculate penalty
        uint penaltyFactor = block.timestamp > userRec.priorStakeTime + lockDuration ? 100 : (100 - penaltyRate);
        // calc claim & reward amounts
        uint claimAmount = penaltyFactor * userRec.stakeBal / 100;
        uint rewardAmount = calcReward(userRec.stakeBal, userRec.priorStakeTime);
        rewardAmount += userRec.unclaimedReward;

        // update totals
        totalStaked -= userRec.stakeBal;
        totRewardsClaimed += rewardAmount;

        // update user record
        userRecords[user] = Record({
            stakeBal: 0,
            priorStakeTime: block.timestamp,                    // not reset so this user is not added to user array again upon subsequent staking (see stake fn)
            unclaimedReward: 0
        });

        return (claimAmount, rewardAmount);
    }

    // calc a user's reward for the latest stake period
    function calcReward(uint stakeBalance, uint stakeStartTime) internal view returns(uint) {
        uint decimalFactor = 10 ** 6;                                                           // 6 digits to 18 digits
        
        // calc time factor (for unstakes before maturity)
        uint maturityTime = stakeStartTime + lockDuration;
        uint endTime = block.timestamp > maturityTime ? maturityTime : block.timestamp;         // limit rewards to lock up period only
        uint scaleFactor = 1000;                                                                // accuracy up to 0.001
        uint timeFactor = scaleFactor * ( endTime - stakeStartTime ) / ONEYEAR;

        // calculate reward value
        return timeFactor * rewardRate * stakeBalance / (100 * scaleFactor * decimalFactor);
    }

    function getUserAddresses() external view returns(address[] memory) {
        return userAddresses;
    }

    function getUserRecord(address user) external view returns(Record memory) {
        return userRecords[user];
    }
}