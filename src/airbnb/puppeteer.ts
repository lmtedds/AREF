import { Browser } from "puppeteer";

import { parseRoomListing } from "./room";

// const AIRBNB_URL = "https://airbnb.ca";
const AIRBNB_URL = "https://www.airbnb.ca/users/show/73583248";

export const scrape = async (browser: Browser): Promise<any> => {
	// FIXME: Should open up main page and find all the listings.

	// FIXME: SHould take list of all listings and traverse them

	// FIXME: Should lastly, take a list of all hosts and try to find additional listings that were missed.

	// FIXME: This is temporary only.
	const TEMP_AIRBNB_PAGE_URL = "https://www.airbnb.ca/rooms/17300762";

	try {
		const page = await browser.newPage();

		await page.goto(TEMP_AIRBNB_PAGE_URL, {timeout: 10 * 1000, waitUntil: "networkidle0"});

		const listingInfo = await parseRoomListing(page);
		console.log(`Parsing of page ${page.url()} returned ${JSON.stringify(listingInfo)}`);

		await browser.close(); // NOTE: Keep close in try so page will remain open if scrape fails.
	} catch(err) {
		console.error(`Unable to parse page ${TEMP_AIRBNB_PAGE_URL}: ${err} @ ${err.stack}`);
		throw err;
	}
};
