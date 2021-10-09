const FarmCoin = artifacts.require("FarmCoin");
const FarmStaker = artifacts.require("FarmStaker");
const mUSC = artifacts.require("mUSC");

// const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

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
    fStaker = await FarmStaker.new(fCoin.address, musdc.address, rewardDurationDays);

    const mintAmount = toWei("1000");
    await fCoin.faucet(mintAmount, { from: admin });
    await musdc.faucet(mintAmount, { from: user1 });
    await musdc.faucet(mintAmount, { from: user2 });
  });

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

    assert(fromWei(fcoinBalAdmin) === "0");
    assert(fromWei(fcoinBalStaker) === "1000");
    assert(contractPhases[parseInt(phase.toString())] === "ACTIVE");
  });

  // should accept user stake - no lockup
  // should accept user stake - no lockup: multiple stakes
  // should accept different users' stake - no lockup
  // should accept user stake

  // it("should start the staking upon admin deposit", async () => {});
});
