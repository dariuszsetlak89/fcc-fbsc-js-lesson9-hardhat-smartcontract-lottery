const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // 0.25 is the premium. It cost 0.25 LINK.
const GAS_PRICE_LINK = 1e9; // 1000000000 // link per gas. Calculated value based on the gas price of the chain.
// Eth price $ 1,000,000,000
// Chainlink Nodes pay the gas fees to give us randomness & do external execusion
// So they price of requests change based on the price of gas

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const args = [BASE_FEE, GAS_PRICE_LINK];

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...");
        // deploy a mock vrfcoordinator...
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        });
        log("Mocks Deployed!");
        log("-------------------------------------------------------");
    }
};

module.exports.tags = ["all", "mocks"];
