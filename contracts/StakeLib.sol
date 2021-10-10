// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library StakeLib {
    struct Record {
        uint stakeBal;              // current stake balance
        uint priorStakeTime;        // timestamp of when last stake started
        uint unclaimedReward;       // to not wipe out rewards if staking after 1st stake matured & didn't claim
    }
}