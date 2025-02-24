// pages/lending.page.ts
import { type Page, type Locator } from "@playwright/test";
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
  readonly interestAccruedText: Locator;

  constructor(page: Page, metamask: MetaMask) {
    super(page, metamask);
    
    this.connectWalletButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.CONNECT_WALLET });
    this.connectedWalletButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.CONNECTED_WALLET });
    this.depositInput = page.getByPlaceholder(TestData.SELECTORS.INPUTS.DEPOSIT);
    this.depositButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.DEPOSIT });
    this.borrowInput = page.getByPlaceholder(TestData.SELECTORS.INPUTS.BORROW);
    this.borrowButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.BORROW });
    this.repayFullButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.REPAY_FULL });
    this.withdrawInput = page.getByPlaceholder(TestData.SELECTORS.INPUTS.WITHDRAW);
    this.withdrawButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.WITHDRAW });
    this.borrowRepayTab = page.getByRole('tab', { name: TestData.SELECTORS.TABS.BORROW_REPAY });
    this.depositWithdrawTab = page.getByRole('tab', { name: TestData.SELECTORS.TABS.DEPOSIT_WITHDRAW });
    this.showInterestDetailsButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.SHOW_INTEREST });
    this.refreshInterestDataButton = page.getByRole('button', { name: TestData.SELECTORS.BUTTONS.REFRESH_INTEREST });
    this.interestAccruedText = page.getByText(TestData.SELECTORS.LABELS.INTEREST_ACCURED, { exact: true });
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
    const interestElement = await this.interestAccruedText.locator('xpath=following-sibling::p').first();
    const interestValue = await interestElement.textContent();
    return interestValue ? parseFloat(interestValue.replace(' ETH', '')) : 0;
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
      
      await this.refreshInterestData();
      interestAmount = await this.getInterestAmount();
      
      if (interestAmount > 0) {
        console.log('Found positive interest amount:', interestAmount);
        break;
      }

      if (attempt < maxAttempts) {
        console.log('Interest is still 0, waiting before next check...');
        await this.waitForTimeout(1000);
      }
    }

    return interestAmount;
  }

}