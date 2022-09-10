const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

// Unit tests run only on local network - localhost, Hardhat
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
          const chainId = network.config.chainId;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]); // Deploys modules with the tag "all" (here both scripts 00 and 01)
              raffle = await ethers.getContract("Raffle", deployer); // Returns a new connection to the Raffle contract
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer); // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffleEntranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
          });

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  // Ideally we make our tests have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState();
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
              });
              // -> can write more tests for constructor
          });

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  );
              });
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  );
              });
              it("doesn't allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  // await network.provider.request({method: "evm_mine", params: []});  // the same as above
                  // We pretend to be a Chainlink Keeper
                  await raffle.performUpkeep([]); // changes the state to calculating for our comparison below
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      // is reverted as raffle is calculating
                      "Raffle__NotOpen"
                  );
              });
          });

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  //// callStatic - simulate sending a transaction and checking what function returns
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers) returns bool
                  assert(!upkeepNeeded);
              });
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  await raffle.performUpkeep("0x"); // changes the state to calculating; "0x" - empty calldata, the same as []
                  const raffleState = await raffle.getRaffleState(); // stores the new state
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers) returns bool
                  // assert.equal(raffleState.toString(), "1");
                  // assert.equal(upkeepNeeded, false);
                  assert.equal(raffleState.toString() == "1", upkeepNeeded == false); // 2 conditions in one assert
              });
              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers) returns bool
                  assert(!upkeepNeeded);
              });
              it("returns true if enough time has passed, has players, eth and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers) returns bool
                  assert(upkeepNeeded);
              });
          });

          describe("performUpkeep", function () {
              it("it can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  const tx = await raffle.performUpkeep([]); // returns bool
                  assert(tx);
              });
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded" // test can be expanded to test all expected values returned by error
                  );
              });
              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  const txResponse = await raffle.performUpkeep([]); // emits requestId
                  const txReceipt = await txResponse.wait(1); // waits 1 block
                  const requestId = txReceipt.events[1].args.requestId; // event[0] - emited by function requestRandomWords(), event[1] - emited by event RequestedRaffleWinner
                  const raffleState = await raffle.getRaffleState(); // updates state
                  assert(requestId.toNumber() > 0); // toNumber or toString - doesn't matter
                  assert(raffleState.toString() == 1); // 0 = open, 1 = calculating
              });
          });
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
              });
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
              });
              // This test is too big...
              it("picks a winner, resets the lottery, ane sends money", async function () {
                  const additionalEntrants = 3; // additional people to enter lottery
                  const startingAccountIndex = 1; // deployer = 0
                  const accounts = await ethers.getSigners();
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++ // i = 1; i < 4; i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i]); // Returns a new instance of the Raffle contract connected to player
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee });
                  } // we have 4 people who entered the lottery - deployer and 3 other users
                  const startingTimeStamp = await raffle.getLatestTimeStamp(); // stores starting timestamp (before we fire our event)

                  // This will be more important for our staging tests...
                  // performUpkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being the Chainlink VRF)
                  // We will have to wait for the fulfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          // Event listener for event WinnerPicked
                          try {
                              //// Finding the winner choosing by Mock - Mock always will choose the same player
                              const recentWinner = await raffle.getRecentWinner();
                              // console.log(`Lottery participants:`);
                              // console.log(`Player 1: accounts[0] ${accounts[0].address}`);
                              // console.log(`Player 2: accounts[1] ${accounts[1].address}`);
                              // console.log(`Player 3: accounts[2] ${accounts[2].address}`);
                              // console.log(`Player 4: accounts[3] ${accounts[3].address}`);
                              console.log(`The winner is: ${recentWinner}`);
                              //// Finding the winner - the winner is accounts[1]
                              console.log("WinnerPicked event fired!");
                              const raffleState = await raffle.getRaffleState();
                              const endingTimeStamp = await raffle.getLatestTimeStamp();
                              const numPlayers = await raffle.getNumberOfPlayers();
                              const winnerEndingBalance = await accounts[1].getBalance(); // accounts[1] is a winner
                              const winnerEndingBalanceDecimal = ethers.utils.formatEther(
                                  await accounts[1].getBalance()
                              );
                              console.log(
                                  `Winner ending balance is: ${winnerEndingBalanceDecimal}`
                              );
                              //// Comparisons to check if our ending values are correct:
                              assert.equal(numPlayers.toString(), "0"); // checks if numPlayers resets after choosing winner
                              assert.equal(raffleState.toString(), "0"); // checks if raffleState is OPEN again after choosing winner
                              assert(endingTimeStamp > startingTimeStamp); // checks if time passed
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrants)
                                              .add(raffleEntranceFee)
                                              .toString()
                                      )
                              ); // checks if winnerEndingBalance is equal to winnerStartingBalance + winning award
                              resolve(); // if try passes, resolves the promise
                          } catch (e) {
                              reject(e);
                          }
                      });
                      // Setting up the listener
                      // below, we will fire the event, and the listener will pick it up, and resolve
                      const tx = await raffle.performUpkeep([]);
                      const txReceipt = await tx.wait(1);
                      const winnerStartingBalance = await accounts[1].getBalance(); // accounts[1] is a winner
                      const winnerStartingBalanceDecimal = ethers.utils.formatEther(
                          await accounts[1].getBalance()
                      );
                      console.log(`Winner starting balance is: ${winnerStartingBalanceDecimal}`);
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      );
                  });
              });
          });
      });
