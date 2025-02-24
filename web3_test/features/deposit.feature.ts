import { type Page, type TestInfo, test } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';

export class DepositFeature {
    private readonly lendingPage: LendingPage;
    private readonly screenshotHelper: ScreenshotHelper;

    constructor(
        private readonly page: Page,
        private readonly context: any,
        private readonly metamask: MetaMask,
        private readonly testInfo: TestInfo
    ) {
        this.lendingPage = new LendingPage(this.page, this.metamask);
        this.screenshotHelper = new ScreenshotHelper();
    }

    async depositETH(amount: string): Promise<void> {
      await test.step('deposit ETH', async () => {
        await this.lendingPage.verifyWalletConnected();
        await this.lendingPage.enterDepositAmount(amount);
        await this.lendingPage.clickDeposit();
        
        const depositCapture = await this.screenshotHelper.captureTransactionScreen(
            this.page, 
            this.context, 
            'deposit-before-confirmation'
        );
        
        this.testInfo.attach('deposit before confirm', {
            path: depositCapture.path,
            contentType: 'image/png'
        });

        await this.lendingPage.confirmDeposit();

        const depositConfirmedBuffer = await this.screenshotHelper.capturePageScreenshot(this.page, 'deposit-after-confirmed');
        
        this.testInfo.attach('deposit after confirm', {
          body: depositConfirmedBuffer,
          contentType: 'image/png',
        });

        await this.lendingPage.verifyDepositAmount(parseFloat(amount));
      }, { box: true });
    }
}