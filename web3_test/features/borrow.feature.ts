import { Page, test } from "@playwright/test";
import { TestInfo } from '@playwright/test';
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';

export class BorrowFeature {
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

    async borrowETH(amount: string): Promise<void> {
        await test.step('borrow ETH', async () => {
            await this.lendingPage.switchToBorrowTab();
            await this.lendingPage.showInterestDetails();
            await this.lendingPage.enterBorrowAmount(amount);
            await this.lendingPage.clickBorrow();
            
            const borrowCapture = await this.screenshotHelper.captureTransactionScreen(
                this.page, 
                this.context, 
                'borrow-before-confirmation'
            );
            
            this.testInfo.attach('borrow before confirm', {
                path: borrowCapture.path,
                contentType: 'image/png'
            });

            await this.lendingPage.confirmBorrow();

            const borrowConfirmedBuffer = await this.screenshotHelper.capturePageScreenshot(this.page, 'borrow-after-confirmed');
            
            this.testInfo.attach('borrow after confirm', {
                body: borrowConfirmedBuffer,
                contentType: 'image/png',
            });

            await this.lendingPage.verifyBorrowAmount(amount);
    }, { box: true });
    }
}