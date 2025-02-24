// helpers/screenshot.helper.ts
import { type Page } from "@playwright/test";
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export class ScreenshotHelper {
  constructor(private screenshotsDir: string = 'screenshots') {
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir);
    }
  }

  async clearScreenshots(): Promise<void> {
    if (fs.existsSync(this.screenshotsDir)) {
      const files = fs.readdirSync(this.screenshotsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.screenshotsDir, file));
      }
    }
  }

  async capturePageScreenshot(page: Page, name: string, fullPage: boolean = true): Promise<Buffer> {
    try {
      const screenshotBuffer = await page.screenshot({ fullPage });
      console.log(`Page screenshot captured: ${name}`);
      return screenshotBuffer;
    } catch (error) {
      console.error('Failed to capture page screenshot:', error);
      return Buffer.from('');
    }
  }

  async captureTransactionScreen(page: Page, context: any, name: string): Promise<{ buffer: Buffer; path: string }> {
    try {
      // Wait for MetaMask popup
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

      // Capture screenshots
      const mainBuffer = await page.screenshot({ fullPage: true });
      const metamaskBuffer = await metamaskPage.screenshot({ fullPage: true });

      // Combine images
      const combinedBuffer = await this.combineScreenshots(mainBuffer, metamaskBuffer);
      const filePath = await this.saveScreenshot(combinedBuffer, name);

      return { buffer: combinedBuffer, path: filePath };
    } catch (error) {
      console.error('Failed to capture transaction screen:', error);
      throw error;
    }
  }

  private async combineScreenshots(mainBuffer: Buffer, metamaskBuffer: Buffer): Promise<Buffer> {
    return await sharp({
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
    .png()
    .toBuffer();
  }

  private async saveScreenshot(buffer: Buffer, name: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(this.screenshotsDir, `${name}-${timestamp}.png`);
    await fs.promises.writeFile(filename, buffer);
    return filename;
  }
}