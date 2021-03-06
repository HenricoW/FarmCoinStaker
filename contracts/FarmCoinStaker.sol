// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import { StakeLocker } from './StakeLocker.sol';
import { StakeLib } from './StakeLib.sol';

contract FarmCoinStaker is Ownable, ReentrancyGuard {
    address public farmCoinAddress;     // address of the reward token
    address public stakeTokenAddress;   // address of the stake token (USDC)
    uint public rewardsBalance;         // total pool tokens available as staking rewards
    uint public totalStaked;            // cumulative total USDC staked
    uint public totRewardsClaimed;      // cumulative total farm coin claimed

    uint public rewardsStartTime;       // time staking started (contract funded the 1st time)
    uint public rewardsEndTime;         // time staking ends
    uint public rewardsDurationDays;    // amount of days staking will be allowed after contract is funded the 1st time
    ContractPhase public stakePhase;    // contract stake phase

    // keep record of the locker contracts
    string[] public lockerNames;        // locker type names
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

        if(stakePhase == ContractPhase.INITIALIZED || stakePhase == ContractPhase.ENDED) {
            rewardsStartTime = block.timestamp;
            rewardsEndTime = rewardsStartTime + (rewardsDurationDays * 1 days);
            stakePhase = ContractPhase.ACTIVE;
        }

        bool success = IERC20(farmCoinAddress).transferFrom(msg.sender, address(this), rewardFundAmount);
        require(success, "FarmStaker#fundContract: Farm coin transfer failed"); // may be unnecessary
    }

    // create a locker, set lockDurationDays = 0 for no lockup
    function createLocker(string memory lockerName, uint lockDurationDays, uint rewardRate, uint penaltyRate) public onlyOwner {
        require(bytes(lockerName).length > 0, "FarmCoinStaker#createLocker: Locker name cannot be empty");
        require(rewardRate > 0, "FarmCoinStaker#createLocker: Reward rate percentage cannot be zero");
        require(address(stakeLockers[lockerName]) == address(0), "FarmCoinStaker#createLocker: Locker with that name already exists");

        StakeLocker locker = new StakeLocker(lockDurationDays, rewardRate, penaltyRate);
        stakeLockers[lockerName] = locker;
        lockerNames.push(lockerName);
    }

    // stake to a specified locker contract (calls stake on that locker)
    function stake(string memory lockerName, uint stakeAmount) external {
        require(stakePhase == ContractPhase.ACTIVE, "FarmCoinStaker#stake: Staking phase not active");
        require(stakeAmount > 0, "FarmCoinStaker#stake: Deposit value cannot be zero");
        StakeLocker locker = stakeLockers[lockerName];
        require(address(locker) != address(0), "FarmCoinStaker#stake: No locker with that name");

        // update global and locker state
        totalStaked += stakeAmount;
        locker.stake(stakeAmount, msg.sender);

        IERC20(stakeTokenAddress).transferFrom(msg.sender, address(this), stakeAmount);
    }

    // unstake from a specified locker contract (calls unstake on that locker)
    function unstakeAll(string memory lockerName) external nonReentrant {
        require(stakePhase != ContractPhase.INITIALIZED, "FarmCoinStaker#unstakeAll: Wrong phase");
        StakeLocker locker = stakeLockers[lockerName];
        require(address(locker) != address(0), "FarmCoinStaker#unstakeAll: No locker with that name");

        StakeLib.Record memory uRecord = locker.getUserRecord(msg.sender);

        // update locker and global state
        (uint unstakeAmt, uint rewardAmt) = locker.unstakeAll(msg.sender);  // penalty applied, if need be
        totalStaked -= uRecord.stakeBal;                                    // use full amount even if penalised, (USDC balance(this) - totalStaked) = tot. penalties
        totRewardsClaimed += rewardAmt;

        IERC20(stakeTokenAddress).transfer(msg.sender, unstakeAmt);
        IERC20(farmCoinAddress).transfer(msg.sender, rewardAmt);
    }

    // HELPERS
    // ---------

    // setup() - sets initial 3 lock up pools (no lockup, 6 month, 1 year)
    function setup() external onlyOwner {
        createLocker("NO_LOCKUP",  0,   10, 0 );
        createLocker("SIX_MONTHS", 182, 20, 10);
        createLocker("ONE_YEAR",   365, 30, 10);
    }

    // get all locker names
    function getLockerNames() external view returns(string[] memory) {
        return lockerNames;
    }

    // get locker properties
    function getLockerDetail(string memory lockerName) external view returns(string memory, address, uint, uint, uint) {
        StakeLocker locker = stakeLockers[lockerName];
        require(address(locker) != address(0), "FarmCoinStaker#getLockerDetail: No locker with that name");

        return (lockerName, address(locker), locker.lockDuration(), locker.rewardRate(), locker.penaltyRate());
    }

    // get user record, given the locker
    function getLockerUserRecord(string memory lockerName, address user) external view returns(StakeLib.Record memory) {
        StakeLocker locker = stakeLockers[lockerName];
        require(address(locker) != address(0), "FarmCoinStaker#getUserRecord: No locker with that name");

        return locker.getUserRecord(user);
    }

    // get user array, given the locker
    function getLockerUserArray(string memory lockerName) external view returns(address[] memory) {
        StakeLocker locker = stakeLockers[lockerName];
        require(address(locker) != address(0), "FarmCoinStaker#getUserRecord: No locker with that name");

        return locker.getUserAddresses();
    }

    // get total staked accross all lockers
    // function allLockerStaked() external view returns(uint) {}

    // get total claimed accross all lockers
    // function allLockerClaimed() external view returns(uint) {}
}