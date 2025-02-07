// test/integration/CrossNetworkTest.test.ts
import { ethers } from 'hardhat';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "mocha";

// Read the JSON file
const networkConfig = JSON.parse(
  readFileSync(join(__dirname, '../config/networks.json'), 'utf-8')
);

describe("Cross Network Testing", function() {
  let addresses: any;
  let signer: SignerWithAddress;

  beforeEach(async function() {
    // Get the first signer (account) from Hardhat
    [signer] = await ethers.getSigners();
    // Get the current network ID
    const network = await ethers.provider.getNetwork();
    
    switch (network.chainId) {
      case 1:
        addresses = networkConfig.mainnet;
        break;
      case 137:
        addresses = networkConfig.polygon;
        break;
      default:
        addresses = networkConfig.local;
    }
  });

  it("should interact with WETH", async function() {
    const weth = await ethers.getContractAt("IWETH", addresses.weth, signer);
    const symbol = await weth.symbol();
    expect(symbol).to.equal("WETH");
  });
});