import { Browser } from "puppeteer";

import { parseHostListing } from "./host";
import { parseRoomListing } from "./room";

// const AIRBNB_URL = "https://airbnb.ca";
const AIRBNB_URL = "https://www.airbnb.ca/users/show/73583248";

export const scrape = async (browser: Browser): Promise<any> => {
	const TEST_ROOM = false;
	const TEST_HOST = false;
	// FIXME: Should open up main page and find all the listings.

	// FIXME: SHould take list of all listings and traverse them

	// FIXME: Should lastly, take a list of all hosts and try to find additional listings that were missed.

	// FIXME: This is for room testing.
	if(TEST_HOST) {
		const TEMP_AIRBNB_HOST_URL = "https://www.airbnb.ca/users/show/73583248";
		try {
			await scrapeHostPage(browser, TEMP_AIRBNB_HOST_URL);
		} catch(err) {
			console.error(`Unable to parse page ${TEMP_AIRBNB_HOST_URL}: ${err} @ ${err.stack}`);
			throw err;
		}
	}

	if(TEST_ROOM) {
		const TEMP_AIRBNB_ROOM_URL = "https://www.airbnb.ca/rooms/17300762";
		try {
			await scrapeRoomPage(browser, TEMP_AIRBNB_ROOM_URL);
		} catch(err) {
			console.error(`Unable to parse page ${TEMP_AIRBNB_ROOM_URL}: ${err} @ ${err.stack}`);
			throw err;
		}
	}
};

const scrapeHostPage = async (browser: Browser, url: string) => {
	let page;
	try {
		page = await browser.newPage();

		await page.goto(url, {timeout: 30 * 1000, waitUntil: "networkidle0"});

		const listingInfo = await parseHostListing(page);
		console.log(`Parsing of page ${page.url()} returned ${JSON.stringify(listingInfo)}`);

	} catch(err) {
		console.error(`Unable to parse page ${url} as room: ${err} @ ${err.stack}`);
		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page. Keep it open for the
		//        time being.
		// if(page) await page.close();
	}

};

const scrapeRoomPage = async (browser: Browser, url: string) => {
	let page;
	try {
		page = await browser.newPage();

		await page.goto(url, {timeout: 30 * 1000, waitUntil: "networkidle0"});

		const listingInfo = await parseRoomListing(page);
		console.log(`Parsing of page ${page.url()} returned ${JSON.stringify(listingInfo)}`);

	} catch(err) {
		console.error(`Unable to parse page ${url} as room: ${err} @ ${err.stack}`);
		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page. Keep it open for the
		//        time being.
		// if(page) await page.close();
	}
};
