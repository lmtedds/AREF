// Some debug facilities
import * as fs from "fs";

import { Page } from "puppeteer";

export const dumpFatalError = async (page: Page, dir: string): Promise<void> => {
	const date = new Date();
	const file = `${dir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${date.getTime()}_screenshot.png`;
	const screenshot = await page.screenshot({fullPage: true});

	fs.writeFileSync(file, screenshot, {mode: 0o444});

	console.error(`screenshot written to ${file}`);

	return Promise.resolve();
};
