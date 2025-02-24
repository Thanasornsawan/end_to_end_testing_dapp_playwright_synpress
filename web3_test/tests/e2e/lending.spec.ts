import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { ScreenshotHelper } from '../../helpers/screenshot.helper';
import { DepositFeature } from '../../features/deposit.feature';
import { BorrowFeature } from '../../features/borrow.feature';
import { RepayFeature } from '../../features/repay.feature';
import { WithdrawFeature } from '../../features/withdraw.feature';
import { WalletFeature } from '../../features/wallet.feature';
import LendingPage from '../../pages/lending.page';
import basicSetup from '../../run/metamask.setup';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
let metamask: MetaMask;

test.describe('Lending Test', () => {
    let screenshotHelper: ScreenshotHelper;
    let depositFeature: DepositFeature;
    let borrowFeature: BorrowFeature;
    let repayFeature: RepayFeature;
    let withdrawFeature: WithdrawFeature;
    let walletFeature: WalletFeature;
    let lendingPage: LendingPage;

    test.beforeEach(async ({ page, context, metamaskPage, extensionId }, testInfo) => {
        // Initialize helpers and features
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
        await borrowFeature.verifyInterestAccumulation(5, 'minutes');

        // Repay
        await repayFeature.repayFullAmount();

        // Withdraw
        await withdrawFeature.withdrawAll();
    });
});