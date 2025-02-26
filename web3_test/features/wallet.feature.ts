import { type Page, type TestInfo, test } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import LendingPage  from '../pages/lending.page';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import { TestData } from '../config/test-data.config';

export class WalletFeature {
    private readonly lendingPage: LendingPage;
    private readonly screenshotHelper: ScreenshotHelper;
    constructor(
        private readonly page: Page,
        private readonly metamask: MetaMask,
        private readonly testInfo: TestInfo,
    ) {
        this.lendingPage = new LendingPage(this.page, this.metamask);
        this.screenshotHelper = new ScreenshotHelper();
    }

    async connectWalletComplete(): Promise<void> {
        await test.step('connect metamask wallet', async () => {
            await this.lendingPage.navigate();
            await this.lendingPage.connectWallet();
            await this.lendingPage.verifyWalletConnected();
    }, { box: true });
    }

    async switchWalletAccount( accountKey: keyof typeof TestData.DEFAULT_HARDHAT_ACCOUNT ): Promise<void> {
        await test.step(`switch metamask account ${accountKey}`, async () => {
            const accountOriginal = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'account_before_switched'
            );
            
            this.testInfo.attach('original account before switch', {
                body: accountOriginal,
                contentType: 'image/png',
            });

            // Get the account details from the key
            const accountDetails = TestData.DEFAULT_HARDHAT_ACCOUNT[accountKey];
            // Switch account in MetaMask
            await this.metamask.switchAccount(accountDetails.ACCOUNT_NAME);
            await this.lendingPage.waitForTimeout(TestData.TIMEOUTS.SHORT);
            // Disconnect old account and connect new account on metamask
            await this.lendingPage.connectedWalletButton.click();
            await this.lendingPage.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
            
            // Connect to dApp
            await this.metamask.connectToDapp();
        
            // Wait for connection to stabilize
            await this.lendingPage.waitForTimeout(TestData.TIMEOUTS.MEDIUM);

            const accountScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'account_after_switched'
            );
            
            this.testInfo.attach('account after switch', {
                body: accountScreenshot,
                contentType: 'image/png',
            });

            // Verify wallet is connected
            await this.lendingPage.verifyConnectedCorrectAccount(accountDetails.ACCOUNT_ADDRESS);
            
    }, { box: true });
    }
}