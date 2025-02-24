import { Page, test, expect } from "@playwright/test"; 
import { TestInfo } from '@playwright/test';
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage  from '../pages/lending.page';
import { TimeHelper } from '../helpers/time.helper';
import { BlockchainHelper } from '../helpers/blockchain.helper';

export class BorrowFeature {
    private readonly lendingPage: LendingPage;
    private readonly screenshotHelper: ScreenshotHelper;
    private readonly blockchainHelper: BlockchainHelper;

    constructor(
        private readonly page: Page,
        private readonly context: any,
        private readonly metamask: MetaMask,
        private readonly testInfo: TestInfo
    ) {
        this.lendingPage = new LendingPage(page, metamask);
        this.screenshotHelper = new ScreenshotHelper();
        this.blockchainHelper = new BlockchainHelper();
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

    async verifyInterestAccumulation(value: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'): Promise<void> {
        await test.step(`verify interest accumulation after ${value} min. interval`, async () => {
            const timeInSeconds = TimeHelper.convertToSeconds(value, unit);
            console.log(`Advancing time by ${TimeHelper.getTimeDescription(timeInSeconds)}...`);

            await this.blockchainHelper.advanceTime(timeInSeconds);
            const interestAmount = await this.lendingPage.waitForPositiveInterest();
            expect(interestAmount).toBeGreaterThan(0);

            const interestScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'interest-accumulation'
            );
            
            this.testInfo.attach('interest accumulation verification', {
                body: interestScreenshot,
                contentType: 'image/png',
            });
        }, { box: true });
    }

}