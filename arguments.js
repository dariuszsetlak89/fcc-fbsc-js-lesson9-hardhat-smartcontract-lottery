const { ethers } = require("hardhat");

// Constructor arguments for manual contract verification on Goerli Etherscan
// Run: yarn hardhat --network goerli verify --constructor-args arguments.js CONTRACT_ADDRESS
// CONTRACT_ADDRESS = 0x45472158E8e8d8df327e60C05e7cBd5256d9A7E8

const vrfCoordinatorV2 = "0x2ca8e0c643bde4c2e08ab1fa0da3401adad7734d";
const entranceFee = ethers.utils.parseEther("0.1");
const gasLane = "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15";
const subscriptionId = "1333";
const callbackGasLimit = "500000";
const interval = "30";

const args = [vrfCoordinatorV2, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval];

module.exports = args;
