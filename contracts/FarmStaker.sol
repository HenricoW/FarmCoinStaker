// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
Contract for distributing staking rewards. Users deposit USDC and receive FarmCoin
To allow users to increase existing stakes or do partial unstakes, the latest reward
amount is calculated at each stake/unstake occurence. This ensures that we only calculate
since the last action - eliminating the need for loops.

ASSUMPTIONS:
1. FarmCoin is 1:1 in value to USDC (implied from problem statement)
2. To limit unsustainably large FarmCoin issuance, staking (any lockup) will only be allowed for a set period, whereafter users can only unstake to claim rewards
3. If many users stake, the reward pool may not have enough to satisfy everyone's APYs. Thus, owner should be able to top up the pool.
3.1     side-benefit: can limit risk in event of exploit by admin topping up reward pool, not depositing all in one go
3.2     need event for when user unstake/claim would exceed contract reward balance (can then be picked up by some admin dashboard)
   Stake Periods:
4. No Lockup        - can add to stake and unstake at any time
5. 6 month & 1 year - cannot add to stake once stake has started, can unstake at any time, penalty if before maturity
6. Stakes with No Lockup will not receive rewards after stake period ends (users could forget stake, causing large liability for app)
7. Stakes with Lockup will continue to get rewards even if that Lockup ends after the stake period ends
7.1     implies rewards need to be honored at most 1 year after stake ends

LIMITATIONS:
1. This implementation will not make provision for the same user to have more than one lock up tier type at a time
2. New lock up tiers (durations) cannot be added after deployment
3. Reward rates are not updateable

NICE TO HAVES (might be excluded):
1. admin able to check total current reward liability ("if everyone were to claim now") - helps indicate when & how much top up is needed, if any
1.1     needs user array to use in conjunction with user mapping
 */

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract FarmStaker is Ownable {
    // one slot per variable a.f.a.p.
    address public farmCoinAddress;     // address of the reward token
    address public stakeTokenAddress;   // address of the stake token (USDC)
    uint public rewardsBalance;         // total pool tokens available as staking rewards
    uint public totalStaked;            // total stake tokens (USDC) staked
    uint64 public constant ONE_YEAR = 365 days; // uint64 needed for struct values, force own slot
    uint public rewardsStartTime;       // time staking started (contract funded the 1st time)
    uint public rewardsEndTime;         // time staking ends
    uint public rewardsDurationDays;    // amount of days staking will be allowed after contract is funded the 1st time
    ContractPhase public stakePhase;    // contract stake phase

    // INITIALIZED - tokens set, contract not funded
    // ACTIVE - contract funded, users can stake
    // ENDED - users can no longer stake, only unstake
    enum ContractPhase {
        INITIALIZED,
        ACTIVE,
        ENDED
    }

    // three lock up tiers
    enum LockupTier {
        NO_LOCKUP,
        SIX_MONTH,
        ONE_YEAR
    }

    // keep record of user details
    // one slot - always read, write all at once
    struct UserDetail {
        uint64 stakeBalance;            // latest stake token (USDC) balance. Max: 18e18 'wei' = 18e12 USDC (6 decimals) - 6000x the current total USDC MktCap
        uint64 lastActTime;             // last timestamp of stake/unstake - uint40.max >> seconds to 31 Dec 9999 since Epoch, therefore, uint64 sufficient
        uint120 latestReward;           // latest (remaining) FarmCoin reward. Calculated at 'lastActTime'. Max: 1.3e36 'wei' = 1.3e18 (18 decimals)
        LockupTier lockupLength;        // user's lock up tier
    }

    mapping(address => UserDetail) public userRecords;

    // ------ EVENTS ------
    /** 
    @notice Event: admin funds contract or tops up
    @param fundAmount       - new funds added
    @param totalRewards     - total remaining rewards at the time
     */
    event ContractFunded(uint fundAmount, uint totalRewards); // two values will differ for top-ups (post initial fund)

    /** 
    @notice Event: user stakes
    @param userAddr         - user address
    @param remainingStake   - updated total stake
    @param latestRewardBal  - latest pending reward calculated
     */
    event UserStaked(address indexed userAddr, uint remainingStake, uint latestRewardBal); // two values will differ for top-ups (post initial fund)

    /** 
    @notice Event: user unstakes
    @param userAddr         - user address
    @param remainingStake   - updated total stake
    @param latestRewardBal  - latest pending reward calculated
     */
    event UserUnstaked(address indexed userAddr, uint remainingStake, uint latestRewardBal); // two values will differ for top-ups (post initial fund)

    
    // ------ CONTRACT BODY ------
    /**
    @notice Constructor: provide addresses of deployed staking token & reward token
    @param _farmCoinAddress     - address of deployed reward token
    @param _stakeTokenAddress   - address of deployed staking token
    @param _rewardDurationDays  - number of days staking will be active
     */
    constructor(address _farmCoinAddress, address _stakeTokenAddress, uint64 _rewardDurationDays) {
        stakePhase = ContractPhase.INITIALIZED;
        farmCoinAddress = _farmCoinAddress;
        stakeTokenAddress = _stakeTokenAddress;
        rewardsDurationDays = _rewardDurationDays;
    }

    /**
    @notice admin funds reward token balance to start rewards. the admin needs to have sufficient reward tokens to fund this txn
            (can also be used to top up if need be)
    @param  rewardFundAmount - amount of reward tokens the amin funds the contract with (needs approval)
     */
    function fundContract(uint rewardFundAmount) external onlyOwner {
        rewardsBalance += rewardFundAmount;

        if(stakePhase == ContractPhase.INITIALIZED) {
            rewardsStartTime = block.timestamp;
            rewardsEndTime = rewardsStartTime + (rewardsDurationDays * 1 days);
            stakePhase = ContractPhase.ACTIVE;
        }

        bool success = IERC20(farmCoinAddress).transferFrom(msg.sender, address(this), rewardFundAmount);
        require(success, "FarmStaker#fundContract: Farm coin transfer failed"); // may be unnecessary

        emit ContractFunded(rewardFundAmount, rewardsBalance);
    }

    function stake(uint64 stakeAmount, uint8 stakeTier) external {
        // check staking phase

        // update globals
        totalStaked += stakeAmount;

        // get user's record
        UserDetail memory userInfo = userRecords[msg.sender];                   // memory reads: less gas than storage reads
        uint64 tsNow = uint64(block.timestamp);                                 // uint40.max >> seconds to 31 Dec 9999 since Epoch, therefore, uint64 sufficient

        // if already staked & locked up, can only stake if after lock up maturity
        bool hasLockedupStake = userInfo.stakeBalance > 0 && userInfo.lockupLength != LockupTier.NO_LOCKUP;
        if(hasLockedupStake) {
            uint64 lockupDuration = userInfo.lockupLength == LockupTier.SIX_MONTH ? 182 days : 365 days;
            uint64 maturityDate = userInfo.lastActTime + lockupDuration;
            require(tsNow > maturityDate, "FarmStaker#stake: Already have a locked up stake that has not matured");
        }
        
        // here: new staker or returning with no lock up or lock up that has matured
        // for returning stakers: make sure the stakeTier is the same

        // TODO: move to separate function
        // TODO: fix - stakeBalance is USDC - 6 decimals
        uint120 updatedReward;
        if(userInfo.lastActTime > 0) {
            // update reward calculation if already staked before
            uint64 timeInterval = tsNow - userInfo.lastActTime;
            uint16 rewardAPY = (uint8(userInfo.lockupLength) + 1) * 10;         // in percent
            uint120 rewardDelta = (timeInterval / ONE_YEAR) * userInfo.stakeBalance * rewardAPY / 100; // ( 2^(64 - 35 + 64 + 16) / 100 ) = (2^109 / 100) [1 yr ~= 2^35 seconds]
            updatedReward = userInfo.latestReward + rewardDelta;
        }

        // if returning staker, make sure stakeTier is the same as before

        userRecords[msg.sender] = UserDetail({
            stakeBalance: userInfo.stakeBalance + stakeAmount, 
            lastActTime: tsNow, 
            latestReward: updatedReward, 
            lockupLength: LockupTier(stakeTier)
        });

        bool success = IERC20(stakeTokenAddress).transferFrom(msg.sender, address(this), stakeAmount);
        require(success, "FarmStaker#stake: Stake coin (USDC) transfer failed"); // may be unnecessary
    }
}