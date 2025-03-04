import { type Page, type TestInfo, test } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import LendingPage from '../pages/lending.page';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import { TestData } from '../config/test-data.config';

export class NetworkFeature {
    private readonly lendingPage: LendingPage;
    private readonly screenshotHelper: ScreenshotHelper;

    constructor(
        private readonly page: Page,
        private readonly context: any,
        private readonly metamask: MetaMask,
        private readonly testInfo: TestInfo,
    ) {
        this.lendingPage = new LendingPage(this.page, this.metamask);
        this.screenshotHelper = new ScreenshotHelper();
    }

    /**
     * Switch network to a different one using the network selector
     * @param targetNetworkName Name of network to switch to (as it appears in the dropdown)
     * @param targetNetworkId ID of the network to switch to (chain ID number)
     */
    async switchNetwork(targetNetworkName: string, targetNetworkId: number): Promise<void> {
        await test.step(`switch network to ${targetNetworkName}`, async () => {
            // Take screenshot before network switch
            const beforeSwitchBuffer = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'before-network-switch'
            );
            
            this.testInfo.attach('before network switch', {
                body: beforeSwitchBuffer,
                contentType: 'image/png',
            });

            // Click the network selector trigger to open dropdown
            await this.lendingPage.openNetworkSelector();
            
            // Select the target network
            await this.lendingPage.selectNetwork(targetNetworkId);

            await this.metamask.switchNetwork(targetNetworkName, true);
            
            // Wait for the switching networks alert to appear
            await this.lendingPage.waitForSwitchingNetworksAlert();
            
            // Wait for the switching networks alert to disappear
            await this.lendingPage.waitForSwitchingNetworksAlertToDisappear();
            
            // Wait for loading position data alert to disappear (if it appears)
            await this.lendingPage.waitForLoadingPositionDataToDisappear();
            
            // Give a moment for UI to stabilize
            await this.lendingPage.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
            
            // Take screenshot after network switch
            const afterSwitchBuffer = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'after-network-switch'
            );
            
            this.testInfo.attach('after network switch', {
                body: afterSwitchBuffer,
                contentType: 'image/png',
            });
            
            // Verify network badge shows the correct network
            await this.lendingPage.verifyNetworkBadgeDisplays(targetNetworkName);
            
            // Verify network selector shows the correct network
            await this.lendingPage.verifyNetworkSelectorDisplays(targetNetworkName);
            
        }, { box: true });
    }
}