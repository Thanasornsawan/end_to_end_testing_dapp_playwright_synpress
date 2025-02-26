import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../../helpers/screenshot.helper';
import { DepositFeature } from '../../features/deposit.feature';
import { BorrowFeature } from '../../features/borrow.feature';
import { RepayFeature } from '../../features/repay.feature';
import { WithdrawFeature } from '../../features/withdraw.feature';
import { WalletFeature } from '../../features/wallet.feature';
import { LiquidationFeature } from '../../features/liquidation.feature';
import LendingPage from '../../pages/lending.page';
import basicSetup from '../../wallet-setup/metamask.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
let metamask: MetaMask;

test.describe('Lending Liquidation Test', () => {
    let screenshotHelper: ScreenshotHelper;
    let depositFeature: DepositFeature;
    let borrowFeature: BorrowFeature;
    let repayFeature: RepayFeature;
    let withdrawFeature: WithdrawFeature;
    let walletFeature: WalletFeature;
    let liquidationFeature: LiquidationFeature;
    let lendingPage : LendingPage;

    test.beforeEach(async ({ page, context, metamaskPage, extensionId }, testInfo) => {
        // Initialize helpers and features
        screenshotHelper = new ScreenshotHelper();
        
        metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);
        
        depositFeature = new DepositFeature(page, context, metamask, testInfo);
        borrowFeature = new BorrowFeature(page, context, metamask, testInfo);
        repayFeature = new RepayFeature(page, context, metamask, testInfo);
        withdrawFeature = new WithdrawFeature(page, context, metamask, testInfo);
        walletFeature = new WalletFeature(page, metamask, testInfo);
        liquidationFeature = new LiquidationFeature(page, context, metamask, testInfo);
        lendingPage = new LendingPage(page, metamask);

        // Clear screenshots
        await screenshotHelper.clearScreenshots();
    });

    test('complete liquidation cycle', async () => {
        // Step 1: Connect wallet and deposit ETH as first account
        await walletFeature.connectWalletComplete();
        await depositFeature.depositETH('1.0');

        // Step 2: Borrow ETH with first account (75% of collateral, which should be risky)
        await borrowFeature.borrowETH('0.75');
        
        // Step 3: Advance time by 60 days to accumulate significant interest
        await borrowFeature.verifyInterestAccumulation(60, 'days');
        
        // Step 4: Switch to liquidate tab and verify current account is in liquidation status but can't liquidate self
        await liquidationFeature.verifyOwnPositionNotLiquidatable();
        
        // Step 5: Switch to second account in MetaMask
        await walletFeature.switchWalletAccount('ACCOUNT_2');
        
        // Liquidate first account's position
        await liquidationFeature.liquidatePosition({
            amountPercentage: 50 // 50% of the user's debt
        });

        // Step 6: Switch back to first account
        await walletFeature.switchWalletAccount('ACCOUNT_1');

        // Repay remaining debt
        await lendingPage.switchToBorrowTab();
        await repayFeature.repayFullAmount();
        
        // Step 7: Verify health factor is now above 1.0
        await liquidationFeature.verifyHealthFactorAboveThreshold(1.0);

        // Step 8: Withdraw
        await withdrawFeature.withdrawAll();
    });
});