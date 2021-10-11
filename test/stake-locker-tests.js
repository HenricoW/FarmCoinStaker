const FarmCoin = artifacts.require("FarmCoin");
const mUSC = artifacts.require("mUSC");
const StakeLocker = artifacts.require("StakeLocker");

const { expectRevert, time } = require("@openzeppelin/test-helpers");

const toWei = (val, unit = "wei") => web3.utils.toWei(val, unit);
const fromWei = (val, unit = "wei") => web3.utils.fromWei(val, unit);

const lockDuration = 365; // days
const rewardRate = 10; // percent
const penaltyRate = 15; // percent

contract("StakeLocker", async (accounts) => {
  const [admin, user1, user2, _] = accounts;

  let sLocker, fCoin, musdc;
  beforeEach(async () => {
    musdc = await mUSC.new();
    fCoin = await FarmCoin.new();

    sLocker = await StakeLocker.new(lockDuration, rewardRate, penaltyRate);

    const mintAmount = toWei("1000");
    await fCoin.faucet(mintAmount, { from: admin });
    await musdc.faucet(mintAmount, { from: user1 });
    await musdc.faucet(mintAmount, { from: user2 });
  });

  if (false) {
  }
  // ----------- STAKES WITH LOCKUP -----------
  // TEST STAKING
  it("should have the correct deploy parameters", async () => {
    const owner = await sLocker.owner();
    const lockSeconds = await sLocker.lockDuration();
    const rewardRate = await sLocker.rewardRate();
    const penaltyRate = await sLocker.penaltyRate();

    const dayInSeconds = time.duration.days(lockDuration);
    assert(owner === admin);
    assert(fromWei(lockSeconds) === dayInSeconds.toString());
    assert(rewardRate.toString() === "10");
    assert(penaltyRate.toString() === "15");
  });

  it("should record stake info - lockup", async () => {
    const fundAmount = toWei("1000", "mwei");
    await sLocker.stake(fundAmount, user1);

    const userAddrs = await sLocker.getUserAddresses();
    const userRecord = await sLocker.getUserRecord(user1);

    const totStake = await sLocker.totalStaked();
    const totClaim = await sLocker.totRewardsClaimed();

    assert(userAddrs.length === 1);
    assert(userAddrs[0] === user1);
    assert(userRecord.stakeBal === fundAmount.toString());
    assert(fromWei(totStake, "mwei") === "1000");
    assert(fromWei(totClaim) === "0");
    // assert(userRecord.priorStakeTime === "")
    assert(userRecord.unclaimedReward === "0");
  });

  it("should record stake info - lockup: multiple users", async () => {
    const fundAmt1 = 1000;
    const fundAmt2 = 500;
    await sLocker.stake(toWei(fundAmt1.toString(), "mwei"), user1);
    await sLocker.stake(toWei(fundAmt2.toString(), "mwei"), user2);

    const userAddrs = await sLocker.getUserAddresses();
    const user1Record = await sLocker.getUserRecord(user1);
    const user2Record = await sLocker.getUserRecord(user2);

    const totStake = await sLocker.totalStaked();
    const totClaim = await sLocker.totRewardsClaimed();

    assert(userAddrs.length === 2);
    assert(userAddrs[0] === user1);
    assert(userAddrs[1] === user2);
    assert(user1Record.stakeBal === toWei("1000", "mwei").toString());
    assert(user1Record.unclaimedReward === "0");
    assert(user2Record.stakeBal === toWei("500", "mwei").toString());
    assert(user2Record.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === (fundAmt1 + fundAmt2).toString());
    assert(fromWei(totClaim) === "0");
  });

  it("should NOT allow stake - lockup: same user, multiple stakes", async () => {
    await sLocker.stake(toWei("1000", "mwei"), user1);
    let userRecord = await sLocker.getUserRecord(user1);

    await expectRevert(
      sLocker.stake(toWei("200", "mwei"), user1),
      "StakeLocker#stake: Already have a locked up stake that has not matured"
    );
  });

  // TEST UNSTAKING
  it("should unstake after maturity without penalty - lockup", async () => {
    // stake
    const stakeAmount = 1000;
    const fundAmount = toWei(stakeAmount.toString(), "mwei");
    await sLocker.stake(fundAmount, user1);

    time.increase(time.duration.days(366));

    // unstake
    const values = await sLocker.unstakeAll.call(user1);
    await sLocker.unstakeAll(user1);
    const totStake = await sLocker.totalStaked();
    const totClaim = await sLocker.totRewardsClaimed();
    const userRecord1 = await sLocker.getUserRecord(user1);

    // check return values
    assert(fromWei(values[0], "mwei") === stakeAmount.toString()); // USDC
    assert(fromWei(values[1]) === ((stakeAmount * rewardRate) / 100).toString()); // farm coin reward - stake & immediate unstake
    // check user details
    assert(fromWei(userRecord1.stakeBal, "mwei") === "0");
    // check contract totals
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === ((stakeAmount * rewardRate) / 100).toString());
  });

  it("should penalize early unstake - lockup", async () => {
    // stake
    const stakeAmount = 1000;
    const fundAmount = toWei(stakeAmount.toString(), "mwei");
    await sLocker.stake(fundAmount, user1);

    // unstake
    const values = await sLocker.unstakeAll.call(user1);
    await sLocker.unstakeAll(user1);
    const totStake = await sLocker.totalStaked();
    const totClaim = await sLocker.totRewardsClaimed();
    const userRecord1 = await sLocker.getUserRecord(user1);

    // check return values
    assert(fromWei(values[0], "mwei") === (stakeAmount * (1 - penaltyRate / 100)).toString()); // USDC
    assert(fromWei(values[1]) === "0"); // farm coin reward - stake & immediate unstake
    // check user details
    assert(fromWei(userRecord1.stakeBal, "mwei") === "0");
    // check contract totals
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === "0");
  });

  it("should NOT unstake - lockup: nothing staked", async () => {
    // unstake
    await expectRevert(sLocker.unstakeAll(user1), "StakeLocker#unstake: Nothing to unstake");
    const userRecord1 = await sLocker.getUserRecord(user1);
    const totStake = await sLocker.totalStaked();
    const totClaim = await sLocker.totRewardsClaimed();

    // check user details
    assert(fromWei(userRecord1.stakeBal, "mwei") === "0");
    // check contract totals
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === "0");
  });

  // ----------- STAKES WITH NO LOCKUP -----------
});
