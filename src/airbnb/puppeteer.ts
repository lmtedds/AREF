import * as fs from "fs";

import { Browser, Page } from "puppeteer";

import { dumpFatalError } from "../debug";
import { maskHeadless } from "../mask";
import { installMouseHelper } from "../puppeteer_mouse_helper";

import { parseHostListing } from "./host";
import { navigateToCity } from "./landing";
import { getAllListings } from "./main_page";
import { parseRoomListing } from "./room";

const AIRBNB_URL = "https://airbnb.ca";
const DEBUG_MOUSE = true;

export const scrape = async (browser: Browser, outDir: string, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<any> => {
	const page: Page = await browser.newPage();
	let activeUrl: string | undefined;

	try {
		await maskHeadless(page);

		if(DEBUG_MOUSE) await installMouseHelper(page);

		await page.goto(AIRBNB_URL, {timeout: 30 * 1000, waitUntil: "networkidle0"});

		await navigateToCity(page, city, province, fromDate, toDate);
		activeUrl = page.url();
		console.log(`Parsing of landing page ${AIRBNB_URL} success. Now on page: ${activeUrl}`);

		const listings = await getAllListings(page);
		console.log(`Parsing of main page ${activeUrl} success. ${listings.length} unique listings: ${JSON.stringify(listings)}`);

		// Write out to files.
		const date = new Date();
		const basePath = `${outDir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${city}_${province}`;
		const jsonData = {
			city: city,
			province: province,
			rooms: listings,
		};
		const csvData = listings.reduce((currVal, roomId) => {
			return currVal + `\n${city}, ${province}, ${roomId}`;
		}, "city, province, roomId");

		// Write out the basic information
		fs.writeFileSync(basePath + "_basic_data.json", JSON.stringify(jsonData), {mode: 0o644});
		fs.writeFileSync(basePath + "_basic_data.csv", csvData, {mode: 0o644});
	} catch(err) {
		console.error(`Unable to parse page ${activeUrl}: ${err} @ ${err.stack}`);

		await dumpFatalError(page, outDir);

		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page. Keep it open for the
		//        time being.
		// if(page) await page.close();
	}
};
