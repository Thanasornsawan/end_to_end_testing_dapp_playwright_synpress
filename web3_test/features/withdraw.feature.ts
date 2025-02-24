import { type Page, type TestInfo, test } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';

export class WithdrawFeature {
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

    async withdrawAll(): Promise<void> {
        await test.step('withdraw all ETH', async () => {
            await this.lendingPage.switchToDepositTab();
            const currentDeposit = await this.lendingPage.getCurrentDeposit();
            await this.lendingPage.enterWithdrawAmount(currentDeposit);
            await this.lendingPage.clickWithdraw();

            const withdrawCapture = await this.screenshotHelper.captureTransactionScreen(
                this.page, 
                this.context, 
                'withdraw-before-confirmation'
            );
            
            this.testInfo.attach('withdraw before confirm', {
                path: withdrawCapture.path,
                contentType: 'image/png'
            });

            await this.lendingPage.confirmWithdraw();

            const withdrawConfirmedBuffer = await this.screenshotHelper.capturePageScreenshot(this.page, 'withdraw-after-confirmed');
            this.testInfo.attach('withdraw after confirm', {
                body: withdrawConfirmedBuffer,
                contentType: 'image/png',
            });

            await this.lendingPage.verifyWithdrawSuccess();
    }, { box: true });
    }
}