// Some debug facilities
import * as fs from "fs";

import sanitize from "filenamify-url";

import { Page } from "puppeteer";

// Create snapshot and a copy of the DOM marked with filename having id in it into directory dir.
export const dumpFatalError = async (page: Page, dir: string, id: string = "no_id"): Promise<void> => {
	// Make sure all directories exist
	fs.mkdirSync(dir, {recursive: true});

	const date = new Date();
	const escapedId = sanitize(id);
	const fileBase = `${dir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${date.getTime()}_${escapedId}`;

	// Generate a screenshot
	const screenshotFile = fileBase + "_screenshot.png";
	const screenshot = await page.screenshot({fullPage: true});
	fs.writeFileSync(screenshotFile, screenshot, {mode: 0o444});
	console.error(`screenshot written to ${screenshotFile}`);

	// Get the matching DOM
	const bodyHTML = await page.evaluate(() => document.body.innerHTML);
	const domFile = fileBase + "_dom.txt";
	fs.writeFileSync(domFile, bodyHTML, {mode: 0o444});
	console.error(`DOM written to ${domFile}`);

	return Promise.resolve();
};
