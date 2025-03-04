import { type Page, type TestInfo, test, expect } from "@playwright/test";
import { MetaMask } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import LendingPage from '../pages/lending.page';

export class LiquidationFeature {
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

    async verifyNoLiquidateDisplay(): Promise<void> {
        // Navigate to the liquidate tab
        await this.lendingPage.switchToLiquidateTab();
            
        // Wait for positions to load
        await this.page.waitForTimeout(1000);

        // Check that the own position element does NOT exist
        await expect(this.page.getByTestId('own-liquidatable-position')).not.toBeVisible();

        // Check that the "No positions" message IS visible
        await expect(this.page.getByText('No positions available for liquidation at this time.')).toBeVisible();
    }
    /**
     * Verify that the user's own position is shown as liquidatable but cannot be liquidated by themselves
     */
    async verifyOwnPositionNotLiquidatable(): Promise<void> {
        await test.step('verify own position not liquidatable', async () => {
            // Navigate to the liquidate tab
            await this.lendingPage.switchToLiquidateTab();
            
            // Wait for positions to load
            await this.page.waitForTimeout(1000);
            
            // Take a screenshot first
            const positionsScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'liquidation-positions-list'
            );
            
            this.testInfo.attach('liquidation positions list', {
                body: positionsScreenshot,
                contentType: 'image/png',
            });
            
            // Verify a position with "Your Position" badge exists
            const ownPosition = this.page.getByTestId('own-liquidatable-position');
            await expect(ownPosition).toBeVisible();
            
            // Look for the badge based on role and text content instead of CSS
            // First, look for a Badge element with exact text "Your Position"
            const yourPositionBadge = ownPosition.getByRole('status')
                .or(ownPosition.getByText('Your Position', { exact: true }))
                .or(ownPosition.locator('[role="status"]:has-text("Your Position")'));
            
            await expect(yourPositionBadge).toBeVisible();
            
            // Verify it's disabled using attributes rather than CSS classes
            const isDisabled = await ownPosition.evaluate(node => {
                return (
                    node.hasAttribute('disabled') ||
                    node.getAttribute('aria-disabled') === 'true' ||
                    node.hasAttribute('data-disabled') ||  
                    getComputedStyle(node).pointerEvents === 'none' ||
                    parseFloat(getComputedStyle(node).opacity) < 1  
                );
            });
            
            expect(isDisabled).toBeTruthy();
            
            // Try to click it and verify no position details appear
            await ownPosition.click();
            await expect(this.page.getByTestId('liquidation-details')).not.toBeVisible();
            
            // Take a screenshot for evidence
            const ownPositionScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'own-position-liquidation-disabled'
            );
            
            this.testInfo.attach('own position not liquidatable', {
                body: ownPositionScreenshot,
                contentType: 'image/png',
            });
        }, { box: true });
    }

    /**
     * Liquidate a position with the specified options
     */
    async liquidatePosition(options: { amountPercentage?: number, exactAmount?: string }): Promise<void> {
        await test.step('liquidate position', async () => {
            // Navigate to the liquidate tab
            await this.lendingPage.switchToLiquidateTab();
            
            // Wait for positions to load
            await this.page.waitForTimeout(2000);
            
            // Take a screenshot of available positions
            const positionsScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'liquidatable-positions'
            );
            
            this.testInfo.attach('available liquidatable positions', {
                body: positionsScreenshot,
                contentType: 'image/png',
            });
            
            // Select the first liquidatable position (explicitly exclude own position)
            const liquidatablePositions = this.page.getByTestId('liquidatable-position');
            
            // Check if we have any liquidatable positions
            const count = await liquidatablePositions.count();
            if (count === 0) {
                throw new Error('No liquidatable positions found');
            }
            
            console.log(`Found ${count} liquidatable positions`);
            
            // Click on the first one
            await liquidatablePositions.first().click();
            
            // Wait for position details to appear
            await expect(this.page.getByTestId('liquidation-details')).toBeVisible();
            
            // Get debt amount for percentage calculation if needed
            let liquidationAmount = '0';
            
            if (options.exactAmount) {
                liquidationAmount = options.exactAmount;
            } else if (options.amountPercentage) {
                const debtText = await this.page.locator('text=Debt:').locator('xpath=following-sibling::p').first().textContent();
                const debtMatch = debtText ? debtText.match(/(\d+\.\d+)/) : null;
                
                if (!debtMatch || !debtMatch[1]) {
                    throw new Error('Could not determine borrower\'s debt amount');
                }
                
                const debtAmount = parseFloat(debtMatch[1]);
                liquidationAmount = (debtAmount * options.amountPercentage / 100).toFixed(6);
            } else {
                // Default to 50% if not specified
                const debtText = await this.page.locator('text=Debt:').locator('xpath=following-sibling::p').first().textContent();
                const debtMatch = debtText ? debtText.match(/(\d+\.\d+)/) : null;
                
                if (!debtMatch || !debtMatch[1]) {
                    throw new Error('Could not determine borrower\'s debt amount');
                }
                
                const debtAmount = parseFloat(debtMatch[1]);
                liquidationAmount = (debtAmount * 50 / 100).toFixed(6);
            }
            
            // Input the liquidation amount
            await this.page.getByTestId('liquidation-amount-input').fill(liquidationAmount);
            
            // Take a screenshot before confirming
            const beforeLiquidationScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'before-liquidation'
            );
            
            this.testInfo.attach('before liquidation confirmation', {
                body: beforeLiquidationScreenshot,
                contentType: 'image/png',
            });
            
            // Click liquidate button
            await this.page.getByTestId('liquidate-button').click();
            
            // Capture the transaction approval screen
            const liquidationCapture = await this.screenshotHelper.captureTransactionScreen(
                this.page, 
                this.context, 
                'liquidation-before-confirmation'
            );
            
            this.testInfo.attach('liquidation before confirm', {
                path: liquidationCapture.path,
                contentType: 'image/png'
            });
            
            // Confirm the transaction in MetaMask
            await this.metamask.confirmTransaction();
            await this.page.waitForTimeout(5000); // Wait longer for transaction to complete
            
            // Take a screenshot after confirmation
            const afterLiquidationScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'after-liquidation'
            );
            
            this.testInfo.attach('after liquidation confirmation', {
                body: afterLiquidationScreenshot,
                contentType: 'image/png',
            });
            
            // Verify the liquidation success message (look for text or alert)
            await expect(this.page.getByText(/Liquidation successful/)).toBeVisible();
        }, { box: true });
    }

    /**
     * Verify that the health factor is above the specified threshold
     */
    async verifyHealthFactorAboveThreshold(threshold: number): Promise<void> {
        await test.step(`verify health factor above ${threshold}`, async () => {            
            // Wait for UI to update
            await this.page.waitForTimeout(2000);
            
            // Get the current health factor
            const healthFactorElement = this.page.getByTestId('health-factor');
            await expect(healthFactorElement).toBeVisible();
            
            const healthFactorText = await healthFactorElement.textContent();
            const match = healthFactorText ? healthFactorText.match(/(\d+\.\d+)/) : null;
            
            if (!match || !match[1]) {
                throw new Error('Could not extract health factor value');
            }
            
            const healthFactor = parseFloat(match[1]);
            console.log(`Current health factor: ${healthFactor}`);
            
            // Verify it's above the threshold
            expect(healthFactor).toBeGreaterThanOrEqual(threshold);
            
            // Take a screenshot for evidence
            const healthFactorScreenshot = await this.screenshotHelper.capturePageScreenshot(
                this.page, 
                'health-factor-verification'
            );
            
            this.testInfo.attach('health factor verification', {
                body: healthFactorScreenshot,
                contentType: 'image/png',
            });
        }, { box: true });
    }
}