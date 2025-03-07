import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../../helpers/screenshot.helper';
import { DepositFeature } from '../../features/deposit.feature';
import { BorrowFeature } from '../../features/borrow.feature';
import { RepayFeature } from '../../features/repay.feature';
import { WithdrawFeature } from '../../features/withdraw.feature';
import { WalletFeature } from '../../features/wallet.feature';
import { LiquidationFeature } from '../../features/liquidation.feature';
import { NetworkFeature } from '../../features/network.feature';
import LendingPage from '../../pages/lending.page';
import basicSetup from '../../wallet-setup/metamask.setup';
import { TestData } from '../../config/test-data.config';
import dbHelper from '../../helpers/database.helper';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
let metamask: MetaMask;
const { expect } = test

test.describe('Lending Liquidation Test', () => {
    let screenshotHelper: ScreenshotHelper;
    let depositFeature: DepositFeature;
    let borrowFeature: BorrowFeature;
    let repayFeature: RepayFeature;
    let withdrawFeature: WithdrawFeature;
    let walletFeature: WalletFeature;
    let liquidationFeature: LiquidationFeature;
    let networkFeature: NetworkFeature;
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
        networkFeature = new NetworkFeature(page, context, metamask, testInfo);
        lendingPage = new LendingPage(page, metamask);

        // Clear screenshots
        await screenshotHelper.clearScreenshots();
    });

    // Clean up database connection after tests
    test.afterAll(async () => {
        await dbHelper.close();
    });

    test('complete liquidation cycle', async () => {
        // Step 1: Connect wallet and deposit ETH as first account
        await test.step('1. Connect wallet and deposit ETH as first account', async () => {
            await walletFeature.connectWalletComplete();
        });

        // Step 2: Deposit on first network
        await test.step(`2. Deposit collateral on first network: ${TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME}`, async () => {
            await lendingPage.verifyNetworkBadgeDisplays(TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME);
            await depositFeature.depositETH('1.0');
        });

        // Step 3: Switch network from local ethereum to local optimism
        await test.step(`3. Switch network from ${TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME} to ${TestData.NETWORK_LIST.NETWORK_OPTIMISM.NETWORK_NAME}`, async () => {
            await networkFeature.switchNetwork(TestData.NETWORK_LIST.NETWORK_OPTIMISM.NETWORK_NAME, TestData.NETWORK_LIST.NETWORK_OPTIMISM.CHIAN_ID);
        });

        // Step 4: Verify total deposit is 0 because each network separate pool
        await test.step('4. Verify total deposit is 0 because each network separate pool', async () => {
            await lendingPage.verifyDepositAmount(parseFloat('0.0'));
        });

        // Step 5: Try make deposit the same amount to verify gas
        await test.step('5. Try make deposit the same amount to verify gas', async () => {
            await depositFeature.depositETH('1.0');
        });

        // Step 6: Verify gas amount network L2 is cheaper than network L1
        await test.step('6. Verify gas amount network L2 is cheaper than network L1', async () => {
            const comparison = await dbHelper.compareGasCosts(TestData.EVENT_NAME.DEPOSIT_EVENT, TestData.NETWORK_LIST.NETWORK_ETH.CHAIN_ID, TestData.NETWORK_LIST.NETWORK_OPTIMISM.CHIAN_ID);
            expect(comparison.l2Metrics.averageGasCostWei).toBeLessThan(comparison.l1Metrics.averageGasCostWei);
        });

        // Step 7: Withdraw all on network optimism
        await test.step(`7. Withdraw all on ${TestData.NETWORK_LIST.NETWORK_OPTIMISM.NETWORK_NAME}`, async () => {
            await withdrawFeature.withdrawAll();
        });

        // Step 8: Switch network back from local optimism to local ethereum
        await test.step(`8. Switch network back to ${TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME} and Verify original position is intact and separate`, async () => {
            await networkFeature.switchNetwork(TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME, TestData.NETWORK_LIST.NETWORK_ETH.CHAIN_ID);
            await lendingPage.verifyDepositAmount(parseFloat('1.0'));
        });
       
        // Step 9: Borrow ETH with first account (75% of collateral, which should be risky)
        await test.step('9. Borrow ETH with first account (75% of collateral, which should be risky)', async () => {
            await borrowFeature.borrowETH('0.75');
        });
        
        // Step 10: Advance time by 60 days to accumulate significant interest
        await test.step('10. Advance time by 60 days to accumulate significant interest', async () => {
            await borrowFeature.verifyInterestAccumulation(60, 'days');
        });
        
        // Step 11: Switch to liquidate tab and verify current account is in liquidation status but can't liquidate self
        await test.step("11. Switch to liquidate tab and verify current account is in liquidation status but can't liquidate self", async () => {
            await liquidationFeature.verifyOwnPositionNotLiquidatable();
        });

        // Step 12: Switch network and verify the same accout no liquidate and borrow amount display
        await test.step("12. Switch network and verify the same accout no liquidate and borrow amount display", async () => {
            await networkFeature.switchNetwork(TestData.NETWORK_LIST.NETWORK_OPTIMISM.NETWORK_NAME, TestData.NETWORK_LIST.NETWORK_OPTIMISM.CHIAN_ID);
            await liquidationFeature.verifyNoLiquidateDisplay();
            await lendingPage.verifyBorrowAmount('0.0')
        });

        // Step 13: Switch network back and change account
        await test.step("13. Switch network back and change to liquidator account, should see liquidate position of account 1 and pay half of his debt", async () => {
            await networkFeature.switchNetwork(TestData.NETWORK_LIST.NETWORK_ETH.NETWORK_NAME, TestData.NETWORK_LIST.NETWORK_ETH.CHAIN_ID);
            await walletFeature.switchWalletAccount('ACCOUNT_2');
            
            // Liquidate first account's position
            await liquidationFeature.liquidatePosition({
                amountPercentage: 50 // 50% of the user's debt
            });
        });

        // Step 14: Switch back to first account
        await test.step("14. Switch back to first account to repay full amount the remaining debt, the health factor threshold should back to aboce 1", async () => {
            await walletFeature.switchWalletAccount('ACCOUNT_1');
            await lendingPage.switchToBorrowTab();
            await repayFeature.repayFullAmount();
            await liquidationFeature.verifyHealthFactorAboveThreshold(1.0);
        });

        // Step 15: Withdraw
        await test.step('15. Withdraw all collateral to clear test step', async () => {
            await withdrawFeature.withdrawAll();
        });

    });
});