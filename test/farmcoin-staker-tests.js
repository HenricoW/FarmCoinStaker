const FarmCoin = artifacts.require("FarmCoin");
const mUSC = artifacts.require("mUSC");
const FarmCoinStaker = artifacts.require("FarmCoinStaker");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

const rewardDurationDays = 5;
const contractPhases = ["INITIALIZED", "ACTIVE", "ENDED"];

const toWei = (val) => web3.utils.toWei(val);
const fromWei = (val) => web3.utils.fromWei(val);

contract("Farm staker tests", async (accounts) => {
  const [admin, user1, user2, _] = accounts;

  let fStaker, fCoin, musdc;
  beforeEach(async () => {
    musdc = await mUSC.new();
    fCoin = await FarmCoin.new();
    fStaker = await FarmCoinStaker.new(fCoin.address, musdc.address, rewardDurationDays);

    await fCoin.faucet(toWei("10000"), { from: admin });
    await musdc.faucet(toWei("1000"), { from: user1 });
    await musdc.faucet(toWei("1000"), { from: user2 });
  });

  if (false) {
  }
  it("should have the correct deploy parameters", async () => {
    const fcoinaddr = await fStaker.farmCoinAddress();
    const stknaddr = await fStaker.stakeTokenAddress();
    const rewarddays = await fStaker.rewardsDurationDays();
    const phase = await fStaker.stakePhase();

    assert(fcoinaddr === fCoin.address);
    assert(stknaddr === musdc.address);
    assert(rewarddays.toString() === rewardDurationDays.toString());
    assert(contractPhases[parseInt(phase.toString())] === "INITIALIZED");
  });

  it("should start the staking upon admin deposit", async () => {
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    const fcoinBalAdmin = await fCoin.balanceOf(admin);
    const fcoinBalStaker = await fCoin.balanceOf(fStaker.address);
    const phase = await fStaker.stakePhase();

    assert(fromWei(fcoinBalAdmin) === "9000");
    assert(fromWei(fcoinBalStaker) === "1000");
    assert(contractPhases[parseInt(phase.toString())] === "ACTIVE");
  });

  it("should allow admin to top up", async () => {
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    const fcoinBalAdmin = await fCoin.balanceOf(admin);
    const fcoinBalStaker = await fCoin.balanceOf(fStaker.address);
    const phase = await fStaker.stakePhase();

    assert(fromWei(fcoinBalAdmin) === "8000");
    assert(fromWei(fcoinBalStaker) === "2000");
    assert(contractPhases[parseInt(phase.toString())] === "ACTIVE");
  });

  it("should create a locker", async () => {
    const lockupDays = 7;
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", lockupDays, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    const lockerNameArray = await fStaker.getLockerNames();
    const lockerDetails = await fStaker.getLockerDetail("ONE_WEEK");

    assert(lockerNameArray.length === 1);
    assert(lockerNameArray[0] === "ONE_WEEK");
    assert(lockerDetails[1].length === 42);
    assert(lockerDetails[2].toString() === time.duration.days(lockupDays).toString());
    assert(lockerDetails[3].toString() === "10");
    assert(lockerDetails[4].toString() === "10");
  });

  it("should create multiple lockers", async () => {
    const lockupDays = 7;
    const lockupDays2 = 14;
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", lockupDays, 10, 10];
    const [ln, ldd, rr, pr] = ["FORTNIGHT", lockupDays2, 15, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);
    await fStaker.createLocker(ln, ldd, rr, pr);

    const lockerNameArray = await fStaker.getLockerNames();
    const lockerDetails = await fStaker.getLockerDetail("ONE_WEEK");
    const lockerDeets = await fStaker.getLockerDetail("FORTNIGHT");

    assert(lockerNameArray.length === 2);
    assert(lockerNameArray[0] === "ONE_WEEK");
    assert(lockerNameArray[1] === "FORTNIGHT");

    assert(lockerDetails[1].length === 42);
    assert(lockerDetails[2].toString() === time.duration.days(lockupDays).toString());
    assert(lockerDetails[3].toString() === "10");
    assert(lockerDetails[4].toString() === "10");

    assert(lockerDeets[1].length === 42);
    assert(lockerDeets[2].toString() === time.duration.days(lockupDays2).toString());
    assert(lockerDeets[3].toString() === "15");
    assert(lockerDeets[4].toString() === "10");
  });

  it("should NOT create a locker - no name", async () => {
    const lockupDays = 7;
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["", lockupDays, 10, 10];
    await expectRevert(
      fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate),
      "FarmCoinStaker#createLocker: Locker name cannot be empty"
    );

    const lockerNameArray = await fStaker.getLockerNames();
    assert(lockerNameArray.length === 0);
  });

  it("should NOT create a locker - reward rate zero", async () => {
    const lockupDays = 7;
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", lockupDays, 0, 10];
    await expectRevert(
      fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate),
      "FarmCoinStaker#createLocker: Reward rate percentage cannot be zero"
    );

    const lockerNameArray = await fStaker.getLockerNames();
    assert(lockerNameArray.length === 0);
  });

  it("should NOT create a locker - name already taken", async () => {
    const lockupDays = 7;
    const lockupDays2 = 14;
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", lockupDays, 10, 10];
    const [ln, ldd, rr, pr] = ["ONE_WEEK", lockupDays2, 15, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    await expectRevert(
      fStaker.createLocker(ln, ldd, rr, pr),
      "FarmCoinStaker#createLocker: Locker with that name already exists"
    );

    const lockerNameArray = await fStaker.getLockerNames();
    const lockerDetails = await fStaker.getLockerDetail("ONE_WEEK");
    assert(lockerNameArray.length === 1);
    assert(lockerDetails[2].toString() === time.duration.days(lockupDays).toString());
  });

  it("should record stake info - lockup", async () => {
    // create a locker
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", 7, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    // fund the main contract
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    // start staking
    const stakeAmount = toWei("1000", "mwei");
    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await fStaker.stake(lockerName, stakeAmount, { from: user1 });

    const userAddrs = await fStaker.getLockerUserArray(lockerName);
    const userRecord = await fStaker.getLockerUserRecord(lockerName, user1);
    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();

    assert(userAddrs.length === 1);
    assert(userAddrs[0] === user1);
    assert(userRecord.stakeBal === stakeAmount.toString());
    // assert(userRecord.priorStakeTime === "")
    assert(userRecord.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === "1000");
    assert(fromWei(totClaim) === "0");
  });

  it("should record stake info - lockup: multiple users", async () => {
    // create a locker
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", 7, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    // fund the main contract
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    // start staking
    const [stakeAmt1, stakeAmt2] = [1000, 500];
    const [stakeAmt1BN, stakeAmt2BN] = [stakeAmt1, stakeAmt2].map((amt) => toWei(amt.toString(), "mwei"));

    await musdc.approve(fStaker.address, stakeAmt1BN, { from: user1 });
    await musdc.approve(fStaker.address, stakeAmt2BN, { from: user2 });
    await fStaker.stake(lockerName, stakeAmt1BN, { from: user1 });
    await fStaker.stake(lockerName, stakeAmt2BN, { from: user2 });

    const userAddrs = await await fStaker.getLockerUserArray(lockerName);
    const user1Record = await fStaker.getLockerUserRecord(lockerName, user1);
    const user2Record = await fStaker.getLockerUserRecord(lockerName, user2);

    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();

    assert(userAddrs.length === 2);
    assert(userAddrs[0] === user1);
    assert(userAddrs[1] === user2);
    assert(user1Record.stakeBal === toWei("1000", "mwei").toString());
    assert(user1Record.unclaimedReward === "0");
    assert(user2Record.stakeBal === toWei("500", "mwei").toString());
    assert(user2Record.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === (stakeAmt1 + stakeAmt2).toString());
    assert(fromWei(totClaim) === "0");
  });

  // to verify that StakeLocker reverts are triggered, its other reverts not tested here
  it("should NOT allow stake - lockup: same user, multiple stakes", async () => {
    // create a locker
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", 7, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    // fund the main contract
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    // start staking
    const stakeAmount = toWei("300", "mwei");
    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await fStaker.stake(lockerName, stakeAmount, { from: user1 });

    time.increase(time.duration.days(2));

    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await expectRevert(
      fStaker.stake(lockerName, stakeAmount, { from: user1 }),
      "StakeLocker#stake: Already have a locked up stake that has not matured"
    );

    const userAddrs = await fStaker.getLockerUserArray(lockerName);
    const userRecord = await fStaker.getLockerUserRecord(lockerName, user1);
    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();

    assert(userAddrs.length === 1);
    assert(userAddrs[0] === user1);
    assert(userRecord.stakeBal === stakeAmount.toString());
    // assert(userRecord.priorStakeTime === "")
    assert(userRecord.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === "300");
    assert(fromWei(totClaim) === "0");
  });

  // should NOT let user stake - lockup: wrong contract phase
  it("should NOT allow stake - lockup: wrong contract phase", async () => {
    // create a locker
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", 7, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    // start staking
    const stakeAmount = toWei("300", "mwei");
    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await expectRevert(
      fStaker.stake(lockerName, stakeAmount, { from: user1 }),
      "FarmCoinStaker#stake: Staking phase not active"
    );

    const userAddrs = await fStaker.getLockerUserArray(lockerName);
    const userRecord = await fStaker.getLockerUserRecord(lockerName, user1);
    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();

    assert(userAddrs.length === 0);
    assert(userRecord.stakeBal === "0");
    // assert(userRecord.priorStakeTime === "")
    assert(userRecord.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === "0");
  });

  // should NOT let user stake - lockup: zero deposit
  it("should NOT allow stake - lockup: zero deposit", async () => {
    // create a locker
    const [lockerName, lockDurationDays, rewardRate, penaltyRate] = ["ONE_WEEK", 7, 10, 10];
    await fStaker.createLocker(lockerName, lockDurationDays, rewardRate, penaltyRate);

    // fund the main contract
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    // start staking
    const stakeAmount = toWei("0", "mwei");
    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await expectRevert(
      fStaker.stake(lockerName, stakeAmount, { from: user1 }),
      "FarmCoinStaker#stake: Deposit value cannot be zero"
    );

    const userAddrs = await fStaker.getLockerUserArray(lockerName);
    const userRecord = await fStaker.getLockerUserRecord(lockerName, user1);
    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();

    assert(userAddrs.length === 0);
    assert(userRecord.stakeBal === stakeAmount.toString());
    // assert(userRecord.priorStakeTime === "")
    assert(userRecord.unclaimedReward === "0");
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === "0");
  });

  // should NOT let user stake - lockup: no locker
  it("should NOT allow stake - lockup: no locker", async () => {
    // fund the main contract
    const fundAmount = toWei("1000");
    await fCoin.approve(fStaker.address, fundAmount);
    await fStaker.fundContract(fundAmount);

    // start staking
    const stakeAmount = toWei("300", "mwei");
    await musdc.approve(fStaker.address, stakeAmount, { from: user1 });
    await expectRevert(
      fStaker.stake("ONE_WEEK", stakeAmount, { from: user1 }),
      "FarmCoinStaker#stake: No locker with that name"
    );

    const totStake = await fStaker.totalStaked();
    const totClaim = await fStaker.totRewardsClaimed();
    assert(fromWei(totStake, "mwei") === "0");
    assert(fromWei(totClaim) === "0");
  });

  //
  // should let user stake - no lockup
  // should let user stake - no lockup: one user, multiple stakes
  // should let users stake - no lockup: multiple users, multiple stakes
});
