import { Page, test } from "@playwright/test";
import { TestInfo } from '@playwright/test';
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';

export class RepayFeature {
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

    async repayFullAmount(): Promise<void> {
        await test.step('repay full amount ETH', async () => {
            await this.lendingPage.clickRepayFull();
            
            const repayCapture = await this.screenshotHelper.captureTransactionScreen(
                this.page, 
                this.context, 
                'repay-before-confirmation'
            );
            
            this.testInfo.attach('repay before confirm', {
                path: repayCapture.path,
                contentType: 'image/png'
            });

            await this.lendingPage.confirmRepay();

            const repayConfirmedBuffer = await this.screenshotHelper.capturePageScreenshot(this.page, 'repay-after-confirmed');
            
            this.testInfo.attach('repay after confirm', {
                body: repayConfirmedBuffer,
                contentType: 'image/png',
            });

            await this.lendingPage.verifyRepaymentSuccess();
        }, { box: true });
    }
}