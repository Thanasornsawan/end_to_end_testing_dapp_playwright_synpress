// pages/base.page.ts
import { type Page } from "@playwright/test";
import { MetaMask } from "@synthetixio/synpress/playwright";

export default class BasePage {
  constructor(protected page: Page, protected metamask: MetaMask) {}

  async navigate(path: string = "/"): Promise<void> {
    await this.page.goto(`http://localhost:3000${path}`);
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}