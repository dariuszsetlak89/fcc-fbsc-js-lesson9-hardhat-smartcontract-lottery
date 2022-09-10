const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

// Staging test runs only on test network - Goerli
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleEntranceFee, deployer;

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer;
              raffle = await ethers.getContract("Raffle", deployer); // Returns a new connection to the Raffle contract
              raffleEntranceFee = await raffle.getEntranceFee();
          });

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  // Enter the raffle
                  console.log("Setting up test...");
                  const startingTimeStamp = await raffle.getLatestTimeStamp();
                  const accounts = await ethers.getSigners();

                  // Setup listener before we enter the raffle, just in case the blockchain moves REALLY fast
                  console.log("Setting up Listener...");
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!");
                          try {
                              // Add our asserts here
                              const recentWinner = await raffle.getRecentWinner();
                              const raffleState = await raffle.getRaffleState();
                              const winnerEndingBalance = await accounts[0].getBalance(); // accounts[0] - deployer account, only player
                              const endingTimeStamp = await raffle.getLatestTimeStamp();

                              await expect(raffle.getPlayer(0)).to.be.reverted; // check s_players array reset - empty s_players array doesn't even have object number 0
                              assert.equal(recentWinner.toString(), accounts[0].address); // check if recent winner is account[0], which is an only player
                              assert.equal(raffleState, 0); // check if raffleState is OPEN again, after picking recentWinner
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              ); // check if money have been transfered correctly to the recentWinner
                              assert(endingTimeStamp > startingTimeStamp); // check if time passed
                              resolve(); // if all asserts pass, then Promise will resolve()
                          } catch (error) {
                              console.log(error);
                              reject(error); // if there is an issue with any of the asserts, then Promise will reject
                          }
                      });
                      // Then entering the raffle
                      console.log("Entering Raffle...");
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee });
                      await tx.wait(1);
                      console.log("Ok, time to wait...");
                      const winnerStartingBalance = await accounts[0].getBalance(); // accounts[0] - deployer account, only player
                      // This code WON'T complete until our listener has finished listening!!!
                  });
              });
          });
      });
