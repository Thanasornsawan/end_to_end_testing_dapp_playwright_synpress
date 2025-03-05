// pages/lending.page.ts
import { type Page, type Locator, expect } from "@playwright/test";
import { MetaMask } from "@synthetixio/synpress/playwright";
import { TestData } from '../config/test-data.config';
import BasePage from "./base.page";

export default class LendingPage extends BasePage {

    readonly connectWalletButton: Locator;
    readonly connectedWalletButton: Locator;
    readonly depositInput: Locator;
    readonly depositButton: Locator;
    readonly borrowInput: Locator;
    readonly borrowButton: Locator;
    readonly repayFullButton: Locator;
    readonly withdrawInput: Locator;
    readonly withdrawButton: Locator;
    readonly borrowRepayTab: Locator;
    readonly depositWithdrawTab: Locator;
    readonly showInterestDetailsButton: Locator;
    readonly refreshInterestDataButton: Locator;
    readonly interestAccruedValue: Locator;
    readonly liquidateTab: Locator;
    readonly liquidatablePositionsList: Locator;
    readonly ownLiquidatablePosition: Locator;
    readonly liquidationAmountInput: Locator;
    readonly liquidateButton: Locator;
    readonly liquidationSuccessMessage: Locator;
    readonly healthFactorText: Locator;
    readonly currentAccountAddress: Locator;
    readonly liquidationDetailsCard: Locator;
    readonly cancelLiquidationButton: Locator;
    readonly networkBadge: Locator;
    readonly networkSelector: Locator;
    readonly networkSelectorTrigger: Locator;
    readonly switchingNetworksAlert: Locator;
    readonly loadingPositionDataAlert: Locator;
    readonly liquidateEmptyText: Locator;

  constructor(page: Page, metamask: MetaMask) {
    super(page, metamask);
    
    // Initialize existing selectors - update to use data-testid where available
    this.connectWalletButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.CONNECT_WALLET });
    this.connectedWalletButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.CONNECTED_WALLET });
    this.depositInput = page.getByTestId('deposit-input');
    this.depositButton = page.getByTestId('deposit-button');
    this.borrowInput = page.getByTestId('borrow-input');
    this.borrowButton = page.getByTestId('borrow-button');
    this.repayFullButton = page.getByTestId('repay-full-button');
    this.withdrawInput = page.getByPlaceholder(TestData.SELECTORS.INPUTS.WITHDRAW);
    this.withdrawButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.WITHDRAW });
    this.borrowRepayTab = page.getByTestId('borrow-repay-tab');
    this.depositWithdrawTab = page.getByTestId('deposit-withdraw-tab');
    this.showInterestDetailsButton = page.getByTestId('show-interest-details-button');
    this.refreshInterestDataButton = page.getByTestId('refresh-interest-data-button');
    this.interestAccruedValue = page.getByTestId('interest-accrued-value');
    this.liquidateTab = page.getByTestId('liquidate-tab');
    this.liquidatablePositionsList = page.getByTestId('liquidatable-position');
    this.ownLiquidatablePosition = page.getByTestId('own-liquidatable-position');
    this.liquidationAmountInput = page.getByTestId('liquidation-amount-input');
    this.liquidateButton = page.getByTestId('liquidate-button');
    this.liquidationSuccessMessage = page.getByTestId('success-message');
    this.healthFactorText = page.getByTestId('health-factor');
    this.currentAccountAddress = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.CONNECTED_WALLET });
    this.liquidationDetailsCard = page.getByTestId('liquidation-details');
    this.cancelLiquidationButton = page.getByTestId('cancel-liquidation');
    this.networkBadge = page.getByTestId('network-badge');
    this.networkSelector = page.getByTestId('network-select');
    this.networkSelectorTrigger = page.getByTestId('network-select-trigger');
    this.switchingNetworksAlert = page.getByText('Switching networks... Please wait.');
    this.loadingPositionDataAlert = page.getByText('Loading position data...');
    this.liquidateEmptyText = page.getByText('No positions available for liquidation at this time.');
  }

  // Connect wallet actions
  async connectWallet(): Promise<void> {
    await this.connectWalletButton.click();
    await this.metamask.connectToDapp();
    await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
  }

  async verifyWalletConnected(): Promise<void> {
    await this.connectedWalletButton.waitFor({ state: 'visible' });
    await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
  }

  async verifyConnectedCorrectAccount(expectedAccount?: string): Promise<void> {
    // Verify the connected wallet button is visible
    await this.connectedWalletButton.waitFor({ state: 'visible' });
    if (expectedAccount) {
      const expectedTextPattern = `Connected: ${expectedAccount.slice(0, 6)}...${expectedAccount.slice(-4)}`;
      // Use Playwright's expect for a more detailed assertion
      await expect(this.connectedWalletButton).toHaveText(new RegExp(expectedTextPattern, 'i'));
    }
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }

  // Deposit actions
  async enterDepositAmount(amount: string): Promise<void> {
    await this.depositInput.fill(amount);
  }

  async clickDeposit(): Promise<void> {
    await this.depositButton.click();
  }

  async confirmDeposit(): Promise<void> {
    await this.metamask.confirmTransaction();
    await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
  }

  async verifyDepositAmount(amount: number): Promise<void> {
    const expectedAmount = amount.toFixed(1);
    await this.page.getByText(new RegExp(TestData.MESSAGES.AMOUNTS.formatDeposit(expectedAmount))).waitFor({ state: 'visible' });
  }

  // Borrow actions
  async switchToBorrowTab(): Promise<void> {
    await this.borrowRepayTab.click();
  }

  async enterBorrowAmount(amount: string): Promise<void> {
    await this.borrowInput.fill(amount);
  }

  async clickBorrow(): Promise<void> {
    await this.borrowButton.click();
  }

  async confirmBorrow(): Promise<void> {
    await this.metamask.confirmTransaction();
    await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
  }

  async verifyBorrowAmount(amount: string): Promise<void> {
    await this.page.getByText(TestData.MESSAGES.AMOUNTS.formatBorrow(amount)).waitFor({ state: 'visible' });
  }

  // Interest related actions
  async showInterestDetails(): Promise<void> {
    await this.showInterestDetailsButton.click();
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }

  async refreshInterestData(): Promise<void> {
    await this.refreshInterestDataButton.click();
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }

  async getInterestAmount(): Promise<number> {
    try {
      // Use the specific data-testid to get the interest value
      const interestElement = this.page.getByTestId('interest-accrued-value');
      
      // Wait for the element to be visible
      await interestElement.waitFor({ state: 'visible', timeout: 5000 });
      
      // Get text content
      const interestText = await interestElement.textContent();
      console.log('Interest accrued text:', interestText);
      
      if (interestText) {
        // Extract numeric value using regex
        const match = interestText.match(/(\d+\.\d+)/);
        if (match && match[1]) {
          return parseFloat(match[1]);
        }
      }
      
      console.log('No interest value found');
      return 0;
    } catch (error) {
      console.error('Error getting interest amount:', error);
      return 0;
    }
  }

  // Repay actions
  async clickRepayFull(): Promise<void> {
    await this.repayFullButton.click();
  }

  async confirmRepay(): Promise<void> {
    await this.metamask.confirmTransaction();
    await this.waitForTimeout(TestData.TIMEOUTS.LONG);
  }

  async verifyRepaymentSuccess(): Promise<void> {
    await this.page.getByText(TestData.MESSAGES.REPAYMENT.SUCCESS).waitFor({ state: 'visible' });
    await this.page.getByText(TestData.MESSAGES.AMOUNTS.formatBorrow(0.0)).waitFor({ state: 'visible' });
  }

  // Withdraw actions
  async switchToDepositTab(): Promise<void> {
    await this.depositWithdrawTab.click();
  }

  async enterWithdrawAmount(amount: number): Promise<void> {
    await this.withdrawInput.fill(amount.toString());
  }

  async clickWithdraw(): Promise<void> {
    await this.withdrawButton.click();
  }

  async confirmWithdraw(): Promise<void> {
    await this.metamask.confirmTransaction();
    await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
  }

  async verifyWithdrawSuccess(): Promise<void> {
    await this.page.getByText(TestData.MESSAGES.AMOUNTS.formatDeposit(0.0)).waitFor({ state: 'visible' });
  }

  async getCurrentDeposit(): Promise<number> {
    const depositText = await this.page.getByText(TestData.SELECTORS.LABELS.DEPOSIT).textContent();
    if (!depositText) return 0;
    
        try {
            const amount = parseFloat(depositText.split('ETH')[0]?.split(':')[1]?.trim() ?? '0');
            return isNaN(amount) ? 0 : amount;
        } catch (error) {
            console.error('Error parsing deposit amount:', error);
            return 0;
        }
    }

    async waitForPositiveInterest(maxAttempts: number = 10): Promise<number> {
        let interestAmount = 0;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          console.log(`\nAttempt ${attempt} to check interest...`);
          
          try {
            // Click the button to show interest details panel
            await this.showInterestDetailsButton.click();
            await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
            
            // Wait for panel to be visible
            await this.page.getByTestId('interest-diagnostics-panel').waitFor({ state: 'visible' });
            
            // Click refresh interest data button
            await this.refreshInterestDataButton.click();
            await this.waitForTimeout(TestData.TIMEOUTS.MEDIUM);
            
            // Get interest amount
            interestAmount = await this.getInterestAmount();
            console.log(`Current interest amount: ${interestAmount}`);
            
            if (interestAmount > 0) {
              console.log('Found positive interest amount:', interestAmount);
              break;
            }
            
            if (attempt < maxAttempts) {
              console.log('Interest is still 0, waiting before next check...');
              await this.waitForTimeout(2000);
            }
          } catch (error) {
            console.error(`Error in attempt ${attempt}:`, error);
          }
        }
        
        return interestAmount;
    }

   /**
   * Switch to the liquidate tab
   */
 async switchToLiquidateTab(): Promise<void> {
    await this.liquidateTab.click();
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }

  /**
   * Wait for liquidatable positions to load
   */
  async waitForLiquidatablePositions(timeout: number = 5000): Promise<void> {
    try {
      // Check if either a liquidatable position or "no positions" message is visible
      await Promise.race([
        this.page.waitForSelector('[data-testid="liquidatable-position"]', { state: 'visible', timeout }),
        this.page.waitForSelector('[data-testid="own-liquidatable-position"]', { state: 'visible', timeout }),
        this.page.waitForSelector('text=No positions available for liquidation', { state: 'visible', timeout })
      ]);
      await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
    } catch (error) {
      console.log('No liquidatable positions found within timeout period');
    }
  }

  /**
   * Verify own address is in liquidation list but not selectable
   */
  async verifyOwnAddressInLiquidationList(): Promise<void> {
    // Verify the own position element exists
    await expect(this.ownLiquidatablePosition).toBeVisible();
    
    // Verify it contains "Your Position" text
    const yourPositionBadge = this.ownLiquidatablePosition.getByRole('status')
        .or(this.ownLiquidatablePosition.getByText('Your Position', { exact: true }))
        .or(this.ownLiquidatablePosition.locator('[role="status"]:has-text("Your Position")'));
            
    await expect(yourPositionBadge).toBeVisible();
  }

  async verifyNoliquidateDisplay(): Promise<void> {
    // Check that the own position element does NOT exist
    await expect(this.ownLiquidatablePosition).not.toBeVisible();

    // Check that the "No positions" message is visible
    await expect(this.liquidateEmptyText).toBeVisible();
  }

  /**
   * Verify own position is not selectable
   */
  async verifyOwnPositionNotSelectable(): Promise<void> {
    // Check that the own position has the disabled attribute or proper aria role
    const isDisabled = await this.ownLiquidatablePosition.evaluate(node => {
        return (
            node.hasAttribute('disabled') ||
            node.getAttribute('aria-disabled') === 'true' ||
            node.hasAttribute('data-disabled') ||  
            getComputedStyle(node).pointerEvents === 'none' ||
            parseFloat(getComputedStyle(node).opacity) < 1  
        );
    });
    
    expect(isDisabled).toBeTruthy();
    
    // Try to click it and verify no selection happens
    await this.ownLiquidatablePosition.click();
    
    // Verify the liquidation details card didn't appear
    await expect(this.liquidationDetailsCard).not.toBeVisible();
  }

  /**
   * Select the first liquidatable position
   */
  async selectFirstLiquidatablePosition(): Promise<void> {
    // Wait for the positions to load
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
    
    // Find the first liquidatable position with the proper data-testid
    const hasLiquidatablePositions = await this.liquidatablePositionsList.count() > 0;
    
    if (!hasLiquidatablePositions) {
      throw new Error('No liquidatable positions found');
    }
    
    // Click the first liquidatable position
    await this.liquidatablePositionsList.first().click();
    
    // Verify the liquidation details card is visible
    await expect(this.liquidationDetailsCard).toBeVisible();
  }

  /**
   * Enter a specific liquidation amount
   */
  async enterLiquidationAmount(amount: string): Promise<void> {
    await this.liquidationAmountInput.fill(amount);
  }

  /**
   * Enter a percentage of the borrower's debt as liquidation amount
   */
  async enterLiquidationPercentage(percentage: number): Promise<void> {
    // Get the borrower's debt amount from the liquidation details card
    const debtText = await this.liquidationDetailsCard.getByText(/Debt:/).locator('xpath=following-sibling::p').first().textContent();
    const debtMatch = debtText ? debtText.match(/(\d+\.\d+)/) : null;
    
    if (!debtMatch || !debtMatch[1]) {
      throw new Error('Could not determine borrower\'s debt amount');
    }
    
    const debtAmount = parseFloat(debtMatch[1]);
    const liquidationAmount = (debtAmount * percentage / 100).toFixed(6);
    
    // Enter the calculated amount
    await this.liquidationAmountInput.fill(liquidationAmount);
    console.log(`Entering liquidation amount: ${liquidationAmount} ETH (${percentage}% of debt: ${debtAmount} ETH)`);
  }

  /**
   * Click the liquidate button
   */
  async clickLiquidate(): Promise<void> {
    await this.liquidateButton.click();
  }

  /**
   * Confirm the liquidation transaction in MetaMask
   */
  async confirmLiquidation(): Promise<void> {
    await this.metamask.confirmTransaction();
    await this.waitForTimeout(TestData.TIMEOUTS.LONG);
  }

  /**
   * Verify liquidation success message
   */
  async verifyLiquidationSuccess(): Promise<void> {
    await expect(this.liquidationSuccessMessage).toBeVisible();
  }

  /**
   * Get the current health factor
   */
  async getCurrentHealthFactor(): Promise<number> {
    const healthFactorText = await this.healthFactorText.textContent();
    const matches = healthFactorText ? healthFactorText.match(/(\d+\.\d+)/) : null;
    
    if (!matches || !matches[1]) {
      throw new Error('Could not determine health factor');
    }
    
    return parseFloat(matches[1]);
  }

  /**
 * Open the network selector dropdown
 */
  async openNetworkSelector(): Promise<void> {
    await this.networkSelectorTrigger.click();
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }
  
  /**
   * Select a network from the dropdown by chain ID
   */
  async selectNetwork(chainId: number): Promise<void> {
    // The network selector option has a data-testid with the chainId
    const networkOption = this.page.getByTestId(`network-option-${chainId}`);
    await networkOption.click();
    await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
  }

  /**
 * Wait for the "Switching networks..." alert to appear
 */
async waitForSwitchingNetworksAlert(timeout: number = 5000): Promise<void> {
    try {
      await this.switchingNetworksAlert.waitFor({ state: 'visible', timeout });
      await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
    } catch (error) {
      console.log('Switching networks alert did not appear within timeout');
    }
  }
  
  /**
   * Wait for the "Switching networks..." alert to disappear
   */
  async waitForSwitchingNetworksAlertToDisappear(timeout: number = 30000): Promise<void> {
    try {
      await this.switchingNetworksAlert.waitFor({ state: 'hidden', timeout });
      await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
    } catch (error) {
      console.log('Switching networks alert did not disappear within timeout');
      throw new Error('Network switching did not complete within the expected time');
    }
  }
  
  /**
   * Wait for the "Loading position data..." alert to disappear
   */
  async waitForLoadingPositionDataToDisappear(timeout: number = 20000): Promise<void> {
    try {
      // First check if the alert is visible at all
      const isVisible = await this.loadingPositionDataAlert.isVisible();
      
      if (isVisible) {
        // If it is visible, wait for it to disappear
        await this.loadingPositionDataAlert.waitFor({ state: 'hidden', timeout });
      }
      await this.waitForTimeout(TestData.TIMEOUTS.SHORT);
    } catch (error) {
      console.log('Loading position data alert did not disappear within timeout');
    }
  }

  /**
  * Verify that the network badge displays the expected network name
  */
  async verifyNetworkBadgeDisplays(expectedNetworkName: string): Promise<void> {
    await expect(this.networkBadge).toContainText(expectedNetworkName);
   }

  /**
 * Verify that the network selector displays the expected network name
 */
async verifyNetworkSelectorDisplays(expectedNetworkName: string): Promise<void> {
    // Check the content of the network selector trigger
    await expect(this.networkSelectorTrigger).toContainText(expectedNetworkName);
  }

}