import { defineWalletSetup } from '@synthetixio/synpress'
import { getExtensionId, MetaMask } from "@synthetixio/synpress/playwright";
import 'dotenv/config'

const SEED_PHRASE = process.env.SEED_PHRASE || ''
const PASSWORD = process.env.METAMASK_PASSWORD || ''

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const extensionId = await getExtensionId(context, "MetaMask");

  const metamask = new MetaMask(context, walletPage, PASSWORD, extensionId);

  await metamask.importWallet(SEED_PHRASE)

  // Add Optimism network (L2)
  await metamask.addNetwork({
    name: 'Local Optimism',
    rpcUrl: 'http://127.0.0.1:8546',
    chainId: 420,
    symbol: 'ETH'
  });

  // Add Ethereum Hardhat network (L1)
  await metamask.addNetwork({
    name: 'Local Ethereum',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    symbol: 'ETH'
  });
})