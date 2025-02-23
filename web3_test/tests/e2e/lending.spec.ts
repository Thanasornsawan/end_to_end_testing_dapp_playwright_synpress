import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { BlockchainHelper } from '../../helpers/blockchain.helper';
import { ScreenshotHelper } from '../../helpers/screenshot.helper';
import { DepositFeature } from '../../features/deposit.feature';
import { BorrowFeature } from '../../features/borrow.feature';
import { RepayFeature } from '../../features/repay.feature';
import { WithdrawFeature } from '../../features/withdraw.feature';
import { WalletFeature } from '../../features/wallet.feature';
import LendingPage from '../../pages/lending.page';
import basicSetup from '../../run/metamask.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;
let metamask: MetaMask;

test.describe('Lending Test', () => {
    let blockchainHelper: BlockchainHelper;
    let screenshotHelper: ScreenshotHelper;
    let depositFeature: DepositFeature;
    let borrowFeature: BorrowFeature;
    let repayFeature: RepayFeature;
    let withdrawFeature: WithdrawFeature;
    let walletFeature: WalletFeature;
    let lendingPage: LendingPage;

    test.beforeEach(async ({ page, context, metamaskPage, extensionId }, testInfo) => {
        // Initialize helpers and features
        blockchainHelper = new BlockchainHelper();
        screenshotHelper = new ScreenshotHelper();
        
        metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);
        
        depositFeature = new DepositFeature(page, context, metamask, testInfo);
        borrowFeature = new BorrowFeature(page, context, metamask, testInfo);
        repayFeature = new RepayFeature(page, context, metamask, testInfo);
        withdrawFeature = new WithdrawFeature(page, context, metamask, testInfo);
        walletFeature = new WalletFeature(page, context, metamask, testInfo);
        lendingPage = new LendingPage(page, new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId));

        // Clear screenshots
        await screenshotHelper.clearScreenshots();
        // Connect wallet
        walletFeature.connectWalletComplete();
    });

    test('complete lending cycle', async () => {
        // Deposit
        await depositFeature.depositETH('2.0');

        // Borrow
        await borrowFeature.borrowETH('0.5');

        // Wait for interest
        console.log('Advancing time by 5 minutes...');
        await blockchainHelper.advanceTime(300);

        // Check for interest accumulation with a single call
        await test.step('wait interest after 5 min. interval', async () => {
            const interestAmount = await lendingPage.waitForPositiveInterest();
            expect(interestAmount).toBeGreaterThan(0);
        }, { box: true });

        // Repay
        await repayFeature.repayFullAmount();

        // Withdraw
        await withdrawFeature.withdrawAll();
    });
});