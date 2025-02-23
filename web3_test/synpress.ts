import { testWithSynpress } from '@synthetixio/synpress'
import { metaMaskFixtures } from '@synthetixio/synpress/playwright'
import connectedSetup from './run/metamask.setup'

export default testWithSynpress(metaMaskFixtures(connectedSetup))