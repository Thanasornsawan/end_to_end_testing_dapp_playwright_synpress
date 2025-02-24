import { type Page, test } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import LendingPage  from '../pages/lending.page';

export class WalletFeature {
    private readonly lendingPage: LendingPage;

    constructor(
        private readonly page: Page,
        private readonly metamask: MetaMask,
    ) {
        this.lendingPage = new LendingPage(this.page, this.metamask);
    }

    async connectWalletComplete(): Promise<void> {
        await test.step('connect metamask wallet', async () => {
            await this.lendingPage.navigate();
            await this.lendingPage.connectWallet();
            await this.lendingPage.verifyWalletConnected();
    }, { box: true });
    }
}