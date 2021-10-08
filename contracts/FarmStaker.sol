// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
Contract for distributing staking rewards. Users deposit USDC and receive FarmToken
To allow users to increase existing stakes or do partial unstakes, the latest reward
amount is calculated at each stake/unstake occurence. This ensures that we only calculate
since the last action - eliminating the need for loops.

ASSUMPTIONS:
1. FarmCoin is 1:1 in value to USDC
2. Staking will be allowed for a set duration, whereafter users can only unstake to claim rewards
3. In the event many users stake, the reward pool may not be enough to satisfy everyone's APYs. Thus, owner should be able to top up pool to avoid frustration. 

LIMITATIONS:
1. This implementation will not make provision for the same user to have more than one lock up tier at a time
2. New lock up tiers cannot be added after deployment
 */

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract FarmStaker is Ownable {
    uint public rewardsBalance;         // total pool tokens available as staking rewards
    address public farmCoinAddress;     // address of the reward token
    address public stakeTokenAddress;   // address of the stake token (USDC)

    // three lock up tiers
    enum LockupTier {
        NO_LOCKUP,
        SIX_MONTH,
        ONE_YEAR
    }

    // keep record of user details
    struct UserDetail {
        uint stakeBalance;              // latest stake token (USDC) balance
        uint lastActTime;               // last timestamp of stake/unstake
        uint latestReward;              // latest (remaining) reward. Calculated at 'lastActTime'
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

    
    // ------ CONTRACT BODY ------
    /**
    @notice Constructor: provide addresses of deployed staking token & reward token
    @param _farmCoinAddress     - address of deployed reward token
    @param _stakeTokenAddress   - address of deployed staking token
     */
    constructor(address _farmCoinAddress, address _stakeTokenAddress) {
        farmCoinAddress = _farmCoinAddress;
        stakeTokenAddress = _stakeTokenAddress;
    }

    /**
    @notice admin funds reward token balance to start rewards. the admin needs to have sufficient reward tokens to fund this txn
            (can also be used to top up if need be)
    @param  rewardFundAmount - amount of reward tokens the amin funds the contract with (needs approval)
     */
    function fundContract(uint rewardFundAmount) external onlyOwner {
        rewardsBalance += rewardFundAmount;

        bool success = IERC20(farmCoinAddress).transferFrom(msg.sender, address(this), rewardFundAmount);
        require(success, "FarmStaker#fundContract: Farm coin transfer failed");

        emit ContractFunded(rewardFundAmount, rewardsBalance);
    }
}