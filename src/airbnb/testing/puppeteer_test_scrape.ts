import { Browser, Page } from "puppeteer";

import { installMouseHelper } from "../../puppeteer_mouse_helper";

import { parseHostListing } from "../host";
import { navigateToCity } from "../landing";
import { getAllListings } from "../main_page";
import { parseRoomListing } from "../room";

const AIRBNB_URL = "https://airbnb.ca";

export const testScrape = async (browser: Browser, outDir: string, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<any> => {
	const TEST_ROOM = false;
	const TEST_HOST = false;
	const TEST_LANDING = false;
	const TEST_MAIN_PAGE = true;

	// FIXME: Should open up main page and find all the listings.

	// FIXME: SHould take list of all listings and traverse them

	// FIXME: Should lastly, take a list of all hosts and try to find additional listings that were missed.

	if(TEST_LANDING) {
		try {
			await scrapeLandingPage(browser, AIRBNB_URL);
		} catch(err) {
			console.error(`Unable to parse landing page ${AIRBNB_URL}: ${err} @ ${err.stack}`);
			throw err;
		}
	}

	if(TEST_HOST) {
		const TEMP_AIRBNB_HOST_URL = "https://www.airbnb.ca/users/show/73583248";
		try {
			await scrapeHostPage(browser, TEMP_AIRBNB_HOST_URL);
		} catch(err) {
			console.error(`Unable to parse host page ${TEMP_AIRBNB_HOST_URL}: ${err} @ ${err.stack}`);
			throw err;
		}
	}

	if(TEST_ROOM) {
		const TEMP_AIRBNB_ROOM_URL = "https://www.airbnb.ca/rooms/17300762";
		try {
			await scrapeRoomPage(browser, TEMP_AIRBNB_ROOM_URL);
		} catch(err) {
			console.error(`Unable to parse room page ${TEMP_AIRBNB_ROOM_URL}: ${err} @ ${err.stack}`);
			throw err;
		}
	}

	if(TEST_MAIN_PAGE) {
		// const URL = "https://www.airbnb.ca/s/Red-Deer--AB/homes?query=Red%20Deer%2C%20AB&adults=0&children=0&infants=0&guests=0&place_id=ChIJmZIRRylUdFMRsEQWRJCjAAU&refinement_paths%5B%5D=%2Ffor_you&source=mc_search_bar&search_type=unknown";
		const URL = "https://www.airbnb.ca/s/Perth--ON/homes";
		// const URL = "https://www.airbnb.ca/s/Ottawa-%C2%B7-Stays/homes";
		try {
			await scrapeMainPage(browser, URL);
		} catch(err) {
			console.error(`Unable to parse main page ${URL}: ${err} @ ${err.stack}`);
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

const scrapeLandingPage = async (browser: Browser, url: string) => {
	let page;
	try {
		page = await browser.newPage();

		await page.goto(url, {timeout: 30 * 1000, waitUntil: "networkidle0"});

		await navigateToCity(page, "Edmonton", "AB");
		console.log(`Parsing of landing page ${url} success. Now on page: ${page.url()}`);

	} catch(err) {
		console.error(`Unable to parse page ${url} as room: ${err} @ ${err.stack}`);
		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page. Keep it open for the
		//        time being.
		// if(page) await page.close();

	}
};

const scrapeMainPage = async (browser: Browser, url: string) => {
	let page;
	try {
		page = await browser.newPage();

		await installMouseHelper(page);

		await page.goto(url, {timeout: 30 * 1000, waitUntil: "networkidle0"});

		const listings = await getAllListings(page);
		console.log(`Parsing of main page ${url} success. ${listings.length} unique listings: ${JSON.stringify(listings)}`);

	} catch(err) {
		console.error(`Unable to parse page ${url} as room: ${err} @ ${err.stack}`);
		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page. Keep it open for the
		//        time being.
		// if(page) await page.close();
	}
};
