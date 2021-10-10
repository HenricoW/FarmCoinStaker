const FarmCoin = artifacts.require("FarmCoin");
const mUSC = artifacts.require("mUSC");
const FarmCoinStaker = artifacts.require("FarmCoinStaker");
const { time } = require("@openzeppelin/test-helpers");

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

  // should allow admin to top up
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

  // should create a locker
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

  // should create multiple lockers
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

  // should NOT create a locker - no name
  // should NOT create a locker - name already taken
  //
  // should let user stake - no lockup
  // should let user stake - no lockup: multiple stakes
  // should let different users' stake - no lockup
  // should let user stake - lockup
  // should NOT let user stake - lockup: prev stake not matured
});
