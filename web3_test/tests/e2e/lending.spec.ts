import { testWithSynpress } from '@synthetixio/synpress';
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright';
import { Page } from '@playwright/test'; 
import { ethers } from 'ethers';
import basicSetup from '../../run/metamask.setup'
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

const test = testWithSynpress(metaMaskFixtures(basicSetup));
const { expect } = test;
let metamask: MetaMask;

async function clearScreenshots(screenshotsDir: string) {
  if (fs.existsSync(screenshotsDir)) {
    const files = fs.readdirSync(screenshotsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(screenshotsDir, file));
    }
  } else {
    fs.mkdirSync(screenshotsDir);
  }
}

async function capturePageScreenshot(page: Page, name: string, fullPage: boolean = true) {
  try {
      const screenshotBuffer = await page.screenshot({ fullPage });

      console.log(`Page screenshot buffer created: ${name}`);
      return screenshotBuffer;
  } catch (error) {
      console.error('Failed to capture page screenshot:', error instanceof Error ? error.message : String(error));
      return Buffer.from(''); // Return an empty buffer in case of error
  }
}

async function saveScreenshot(buffer: Buffer, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join('screenshots', `${name}-${timestamp}.png`);
  
  await fs.promises.writeFile(filename, buffer);
  return filename;
}

async function captureTransactionScreen(page: Page, context: any, name: string): Promise<{ buffer: Buffer; path: string }> {
  try {
    if (!fs.existsSync('screenshots')) {
      fs.mkdirSync('screenshots');
    }

    // Wait for the MetaMask popup
    const [metamaskPage] = await Promise.all([context.waitForEvent('page')]);
    await metamaskPage.setViewportSize({ width: 600, height: 800 });
    await metamaskPage.waitForSelector('html.metamask-loaded', { timeout: 20000 });

    try {
      await metamaskPage.waitForSelector('.confirm-page-container-content', { 
        state: 'visible', 
        timeout: 20000 
      });
      await metamaskPage.waitForTimeout(1000);
    } catch (error) {
      console.error('Failed to find MetaMask confirm container:', error);
    }

    // Take screenshots
    const mainBuffer = await page.screenshot({ fullPage: true });
    const metamaskBuffer = await metamaskPage.screenshot({ fullPage: true });

    // Create combined image
    const combinedBuffer = await sharp({
      create: {
        width: 1600,
        height: 800,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite([
      {
        input: await sharp(mainBuffer)
          .resize({ width: 1000, height: 800, fit: 'contain' })
          .toBuffer(),
        left: 0,
        top: 0
      },
      {
        input: await sharp(metamaskBuffer)
          .resize({ width: 600, height: 800, fit: 'contain' })
          .toBuffer(),
        left: 1000,
        top: 0
      }
    ])
    .png() // Ensure output is PNG
    .toBuffer();

    // Save to file and return both buffer and path
    const filePath = await saveScreenshot(combinedBuffer, name);
    return { 
      buffer: combinedBuffer,
      path: filePath 
    };

  } catch (error) {
    console.error('Failed to capture transaction screen:', error);
    throw error;
  }
}

async function getCurrentDeposit(page: Page): Promise<number> {
  const depositText = await page.getByText(/Deposit:/).textContent();
  if (!depositText) return 0;
  
  try {
    return parseFloat(depositText.split('ETH')[0].split(':')[1].trim());
  } catch (error) {
    console.error('Error parsing deposit amount:', error);
    return 0;
  }
}

// Helper function to advance blockchain time
async function advanceTime(seconds: number) {
  const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
  
  // Get current block time
  const currentBlock = await provider.getBlock('latest');
  console.log('Current block time:', new Date(currentBlock.timestamp * 1000));

  // Increase time
  await provider.send('evm_increaseTime', [seconds]);
  
  // Mine a new block
  await provider.send('evm_mine', []);

  // Verify time advance
  const newBlock = await provider.getBlock('latest');
  console.log('New block time:', new Date(newBlock.timestamp * 1000));
  console.log('Time advanced:', newBlock.timestamp - currentBlock.timestamp, 'seconds');
}
test.describe('Lending Test', () => {
  const screenshotsDir = path.join(__dirname, '../../screenshots');

  test.beforeEach(async ({ context, page, metamaskPage, extensionId }) => {
    // Clear screenshots folder before each test
    clearScreenshots(screenshotsDir);
    // Initialize MetaMask
    metamask = new MetaMask(context, metamaskPage, basicSetup.walletPassword, extensionId);

    // Navigate to app
    await page.goto('http://localhost:3000');

    // Connect wallet
    const connectButton = page.getByRole('button', { name: /Connect Wallet/i });
    await connectButton.click();

    // Connect dApp to MetaMask
    await metamask.connectToDapp();
    await page.waitForTimeout(2000);

    // Verify wallet connection
    const connectedButton = page.getByRole('button', { name: /Connected: 0x/i });
    await expect(connectedButton).toBeVisible();
  });

  test('should repay full amount with accumulated interest and withdraw deposit', async ({ page, context }, testInfo) => {
  
    // First deposit and borrow
    let currentDeposit = await getCurrentDeposit(page);
    const depositAmount = '2.0';
    
    await page.getByPlaceholder('Amount to deposit').fill(depositAmount);
    const depositButton = page.getByRole('button', { name: 'Deposit' });
    await depositButton.click();

    const depositCapture = await captureTransactionScreen(page, context, 'deposit-before-confirmation');
    testInfo.attach('deposit before confirm', {
      path: depositCapture.path,
      contentType: 'image/png',
    });

    // No need to pass metamaskPage directly, it's handled inside captureTransactionScreen
    await metamask.confirmTransaction();
    await page.waitForTimeout(2000);

    const expectedTotal = currentDeposit + parseFloat(depositAmount);
    const depositConfirmedBuffer = await capturePageScreenshot(page, 'deposit-after-confirmed');
    testInfo.attach('deposit after confirm', {
      body: depositConfirmedBuffer,
      contentType: 'image/png',
    });
    await expect(page.getByText(new RegExp(`Deposit: ${expectedTotal.toFixed(1)} ETH`))).toBeVisible();

    // Switch to borrow tab and borrow
    const borrowAmount = '0.5';
    await page.getByRole('tab', { name: 'Borrow/Repay' }).click();
    
    // Show interest details before borrowing
    await page.getByRole('button', { name: 'Show Interest Details' }).click();
    await page.waitForTimeout(1000);
    console.log('Interest metrics before borrowing:');
    const initialInterestInfo = await page.getByText(/Timing Information/).textContent();
    console.log(initialInterestInfo);

    // Perform borrow
    await page.getByPlaceholder('Amount to borrow').fill(borrowAmount);
    const borrowButton = page.getByRole('button', { name: 'Borrow' });
    await borrowButton.click();

    const borrowBuffer = await captureTransactionScreen(page, context, 'borrow-before-confirmation');
    testInfo.attach('borrow before confirm', {
      path: borrowBuffer.path,
      contentType: 'image/png',
    });
    
    await metamask.confirmTransaction();
    await page.waitForTimeout(2000);

    // Initial verification should match exact borrow amount
    const borrowConfirmedBuffer = await capturePageScreenshot(page, 'borrow-after-confirmed');
    testInfo.attach('borrow after confirm', {
      body: borrowConfirmedBuffer,
      contentType: 'image/png',
    });
    await expect(page.getByText(`Borrow: ${borrowAmount} ETH`)).toBeVisible();

    // Refresh and check interest details right after borrowing
    await page.getByRole('button', { name: 'Refresh Interest Data' }).click();
    await page.waitForTimeout(2000);
    const postBorrowInterestInfo = await page.getByText(/Timing Information/).textContent();
    console.log(postBorrowInterestInfo);

    // Advance time and verify interest accrual
    console.log('Advancing time by 5 minutes...');
    await advanceTime(300);

    // Wait for interest to be greater than 0 with polling
    let interestAmount = 0;
    const maxAttempts = 10;
    let attempts = 0;

      while (interestAmount === 0 && attempts < maxAttempts) {
        attempts++;
        console.log(`\nAttempt ${attempts} to check interest...`);
        
        // Refresh interest data
        await page.getByRole('button', { name: 'Refresh Interest Data' }).click();
        await page.waitForTimeout(1000); // Reduced wait time

        // Get latest interest value
        const interestText = await page.getByText('Interest Accrued:', { exact: true }).first();
        const interestValueElement = await interestText.locator('xpath=following-sibling::p').first();
        const interestValue = await interestValueElement.textContent();
        
        console.log('Current interest value:', interestValue);

        if (interestValue) {
          const parsedValue = parseFloat(interestValue.replace(' ETH', ''));
          console.log('Parsed interest amount:', parsedValue);
          
          if (parsedValue > 0) {
            interestAmount = parsedValue;
            console.log('Found positive interest amount:', interestAmount);
            break; // Exit loop when we find positive interest
          }
        }

        if (interestAmount === 0 && attempts < maxAttempts) {
          console.log('Interest is still 0, waiting before next check...');
          await page.waitForTimeout(1000); // Reduced wait time between checks
        }
      }

      console.log('Final interest amount:', interestAmount);
      expect(interestAmount).toBeGreaterThan(0);

    // Click "Repay Full Amount" button
    const repayFullButton = page.getByRole('button', { name: 'Repay Full Amount' });
    await repayFullButton.click();

    const repayBuffer = await captureTransactionScreen(page, context, 'repay-before-confirmation');
    testInfo.attach('repay before confirm', {
      path: repayBuffer.path,
      contentType: 'image/png',
    });

    await metamask.confirmTransaction();
    await page.waitForTimeout(5000);

    // Verify success message indicates interest was paid
    await expect(
      page.getByText(/Full repayment successful/)
    ).toBeVisible();
    const repayConfirmedBuffer = await capturePageScreenshot(page, 'repay-after-confirmed');
    testInfo.attach('repay after confirm', {
      body: repayConfirmedBuffer,
      contentType: 'image/png',
    });

    // Verify borrow amount is back to 0
    await expect(
      page.getByText('Borrow: 0.0 ETH')
    ).toBeVisible();

    // Switch back to deposit tab
    await page.getByRole('tab', { name: 'Deposit/Withdraw' }).click();

    // Get current deposit amount for withdrawal
    currentDeposit = await getCurrentDeposit(page);
    
    // Fill withdrawal amount with current deposit
    await page.getByPlaceholder('Amount to withdraw').fill(currentDeposit.toString());
    
    // Click withdraw button
    const withdrawButton = page.getByRole('button', { name: 'Withdraw' });
    await withdrawButton.click();

    const withdrawBuffer = await captureTransactionScreen(page, context, 'withdraw-before-confirmation');
    testInfo.attach('withdraw before confirm', {
      path: withdrawBuffer.path,
      contentType: 'image/png',
    });

    await metamask.confirmTransaction();
    await page.waitForTimeout(2000);

    const withdrawConfirmedBuffer = await capturePageScreenshot(page, 'withdraw-after-confirmed');
    testInfo.attach('withdraw after confirm', {
      body: withdrawConfirmedBuffer,
      contentType: 'image/png',
    });
    // Verify deposit is now 0
    await expect(
      page.getByText('Deposit: 0.0 ETH')
    ).toBeVisible();

  });

});