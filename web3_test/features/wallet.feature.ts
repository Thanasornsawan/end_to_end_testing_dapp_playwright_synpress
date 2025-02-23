import { Page, test } from "@playwright/test";
import { TestInfo } from '@playwright/test';
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';

export class WalletFeature {
    private readonly lendingPage: LendingPage;
    private readonly screenshotHelper: ScreenshotHelper;

    constructor(
        private readonly page: Page,
        private readonly context: any,
        private readonly metamask: MetaMask,
        private readonly testInfo: TestInfo
    ) {
        this.lendingPage = new LendingPage(page, metamask);
        this.screenshotHelper = new ScreenshotHelper();
    }

    async connectWalletComplete(): Promise<void> {
        await test.step('connect metamask wallet', async () => {
            await this.lendingPage.navigate();
            await this.lendingPage.connectWallet();
            await this.lendingPage.verifyWalletConnected();
    }, { box: true });
    }
}