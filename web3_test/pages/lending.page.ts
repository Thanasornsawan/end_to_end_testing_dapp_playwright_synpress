// pages/lending.page.ts
import { Page, Locator } from "@playwright/test";
import { MetaMask } from "@synthetixio/synpress/playwright";
import BasePage from "./base.page";

export default class LendingPage extends BasePage {
  // Locators
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
    
    // Initialize all locators
    this.connectWalletButton = page.getByRole('button', { name: /Connect Wallet/i });
    this.connectedWalletButton = page.getByRole('button', { name: /Connected: 0x/i });
    this.depositInput = page.getByPlaceholder('Amount to deposit');
    this.depositButton = page.getByRole('button', { name: 'Deposit' });
    this.borrowInput = page.getByPlaceholder('Amount to borrow');
    this.borrowButton = page.getByRole('button', { name: 'Borrow' });
    this.repayFullButton = page.getByRole('button', { name: 'Repay Full Amount' });
    this.withdrawInput = page.getByPlaceholder('Amount to withdraw');
    this.withdrawButton = page.getByRole('button', { name: 'Withdraw' });
    this.borrowRepayTab = page.getByRole('tab', { name: 'Borrow/Repay' });
    this.depositWithdrawTab = page.getByRole('tab', { name: 'Deposit/Withdraw' });
    this.showInterestDetailsButton = page.getByRole('button', { name: 'Show Interest Details' });
    this.refreshInterestDataButton = page.getByRole('button', { name: 'Refresh Interest Data' });
    this.interestAccruedText = page.getByText('Interest Accrued:', { exact: true });
  }

  // Connect wallet actions
  async connectWallet(): Promise<void> {
    await this.connectWalletButton.click();
    await this.metamask.connectToDapp();
    await this.waitForTimeout(2000);
  }

  async verifyWalletConnected(): Promise<void> {
    await this.connectedWalletButton.waitFor({ state: 'visible' });
    await this.waitForTimeout(2000);
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
    await this.waitForTimeout(2000);
  }

  async verifyDepositAmount(amount: number): Promise<void> {
    const expectedAmount = amount.toFixed(1);
    await this.page.getByText(new RegExp(`Deposit: ${expectedAmount} ETH`)).waitFor({ state: 'visible' });
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
    await this.waitForTimeout(2000);
  }

  async verifyBorrowAmount(amount: string): Promise<void> {
    await this.page.getByText(`Borrow: ${amount} ETH`).waitFor({ state: 'visible' });
  }

  // Interest related actions
  async showInterestDetails(): Promise<void> {
    await this.showInterestDetailsButton.click();
    await this.waitForTimeout(1000);
  }

  async refreshInterestData(): Promise<void> {
    await this.refreshInterestDataButton.click();
    await this.waitForTimeout(1000);
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
    await this.waitForTimeout(5000);
  }

  async verifyRepaymentSuccess(): Promise<void> {
    await this.page.getByText(/Full repayment successful/).waitFor({ state: 'visible' });
    await this.page.getByText('Borrow: 0.0 ETH').waitFor({ state: 'visible' });
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
    await this.waitForTimeout(2000);
  }

  async verifyWithdrawSuccess(): Promise<void> {
    await this.page.getByText('Deposit: 0.0 ETH').waitFor({ state: 'visible' });
  }

  // Helper methods
  async getCurrentDeposit(): Promise<number> {
    const depositText = await this.page.getByText(/Deposit:/).textContent();
    if (!depositText) return 0;
    try {
      return parseFloat(depositText.split('ETH')[0].split(':')[1].trim());
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