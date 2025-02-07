const { ethers } = require('hardhat');
const fs = require('fs');

async function getDeployedAddresses() {
  // Deploy contracts
  const Token = await ethers.getContractFactory("TestLendingProtocol");
  const token = await Token.deploy();
  await token.deployed();

  // Get all deployed addresses
  const addresses = {
    local: {
      lendingProtocol: token.address,
      // If you need WETH on local:
      weth: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9", // example address
      usdc: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9", // example address
    }
  };

  // Save addresses to file
  fs.writeFileSync(
    './test/config/addresses.json',
    JSON.stringify(addresses, null, 2)
  );

  return addresses;
}

module.exports = {
  getDeployedAddresses
};