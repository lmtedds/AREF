import * as fs from "fs";

import { Browser, Page } from "puppeteer";

import { dumpFatalError } from "../debug";
import { maskHeadless } from "../mask";
import { installMouseHelper } from "../puppeteer_mouse_helper";

import { setCookiePreferences } from "./cookies";
import { parseHostListing } from "./host";
import { navigateToCity } from "./landing";
import { getAllListings } from "./main_page";
import { parseRoomListing } from "./room";
import { IAirbnbRoomIdScrapeData, IAirbnbRoomScrapeData } from "./types";

const AIRBNB_URL = "https://airbnb.ca";
const DEBUG_MOUSE = true;

// FIXME: Date() shouldn't be used... should be fromDate and toDate that are used.
export const scrapeCityForRooms = async (browser: Browser, outDir: string, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<IAirbnbRoomIdScrapeData> => {
	const page: Page = await browser.newPage();
	let activeUrl: string | undefined;

	const jsonRoomData: IAirbnbRoomIdScrapeData = {
		city: city,
		province: province,
		rooms: [],
	};

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
		const basePath = `${outDir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${city.replace(" ", "_")}_${province.replace(" ", "_")}_airbnb`;

		jsonRoomData.rooms = listings;

		const csvRoomData = listings.reduce((currVal, roomId) => {
			return currVal + `\n${city}, ${province}, ${roomId}`;
		}, "city, province, roomId");

		// Write out the basic information
		fs.writeFileSync(basePath + "_basic_data.json", JSON.stringify(jsonRoomData, null, 4), {mode: 0o644});
		fs.writeFileSync(basePath + "_basic_data.csv", csvRoomData, {mode: 0o644});
	} catch(err) {
		console.error(`Unable to parse page ${activeUrl}: ${err} @ ${err.stack}`);

		await dumpFatalError(page, outDir);

		throw err;
	} finally {
		// NOTE: While debugging it's useful to not close the page.
		if(page) await page.close();
	}

	return Promise.resolve(jsonRoomData);
};

export const scrapeRooms = async (browser: Browser, outDir: string, roomIdScrapeData: IAirbnbRoomIdScrapeData): Promise<IAirbnbRoomScrapeData> => {
	const roomData: IAirbnbRoomScrapeData = {
		city: roomIdScrapeData.city,
		province: roomIdScrapeData.province,
		data: {},
	};

	const failedRooms: any = {};

	const page: Page = await browser.newPage();
	let roomUrl: string | undefined;

	try {
		let first = true;
		let count = 1;

		for(const roomId of roomIdScrapeData.rooms) {
			// Should look like: https://www.airbnb.ca/rooms/17300762
			roomUrl = AIRBNB_URL + "/rooms/" + roomId;

			console.log(`(${count}) Navigating to url ${roomUrl} for ${roomId}`);
			++count;

			try {

				await page.goto(roomUrl, {timeout: 30 * 1000, waitUntil: "networkidle0"});

				// Set cookie preferences the first time if they're there.
				if(first) {
					first = false;

					await setCookiePreferences(page);
				}

				const data = await parseRoomListing(page);

				roomData.data[roomId] = data;

				console.log(`room info is: ${JSON.stringify(data)}`);
			} catch(err) {
				// Try to keep going even though there was a failure
				console.error(`failure to parse room page @ ${roomUrl}: ${err}`);

				failedRooms[roomId] = {
					url: roomUrl,
					msg: err.message,
					stack: err.stack,
				};
			}
		}

		// Write out to files.
		const date = new Date();
		const basePath = `${outDir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${roomIdScrapeData.city.replace(" ", "_")}_${roomIdScrapeData.province.replace(" ", "_")}_airbnb`;

		// FIXME: Fragile to adding fields.
		const csvRoomData = Object.keys(roomData.data).reduce((currVal, roomId) => {
			const roomInfo = roomData.data[roomId];

			return currVal + `\n${roomIdScrapeData.city}, ${roomIdScrapeData.province}, ` +
				`${roomInfo.id}, ${roomInfo.url},` +
				`${cleanStringForCsv(roomInfo.title)}, ${roomInfo.type}, ${roomInfo.hostUri}, ${roomInfo.hostId}, ` +

				`${roomInfo.coHostUris.length > 0 ? roomInfo.coHostUris[0] : ""}, ` +
				`${roomInfo.coHostUris.length > 1 ? roomInfo.coHostUris[1] : ""}, ` +
				`${roomInfo.coHostUris.length > 2 ? roomInfo.coHostUris[2] : ""}, ` +
				`${roomInfo.coHostUris.length > 3 ? roomInfo.coHostUris[3] : ""}, ` +

				`${roomInfo.coHostIds.length > 0 ? roomInfo.coHostIds[0] : ""}, ` +
				`${roomInfo.coHostIds.length > 1 ? roomInfo.coHostIds[1] : ""}, ` +
				`${roomInfo.coHostIds.length > 2 ? roomInfo.coHostIds[2] : ""}, ` +
				`${roomInfo.coHostIds.length > 3 ? roomInfo.coHostIds[3] : ""}, ` +

				`${roomInfo.price}, ${roomInfo.guests}, ${roomInfo.bedrooms}, ${roomInfo.beds}, ${roomInfo.bathrooms}`;
		}, "city, province, roomId, roomUrl, title, type, hostUri, hostId, coHostUri1, coHostUri2, coHostUri3, coHostUris4, coHostId1, coHostId2, coHostId3, coHostId4, price, guests, bedrooms, beds, bathrooms");

		// Write out the basic information
		fs.writeFileSync(basePath + "_room_data.json", JSON.stringify(roomData, null, 4), {mode: 0o644});
		fs.writeFileSync(basePath + "_room_data.csv", csvRoomData, {mode: 0o644});

		// Write out failures if there are any or an almost empty file if there are none.
		const failedKeys = Object.keys(failedRooms);
		const failedJsonOutput = {
			city: roomData.city,
			province: roomData.province,
			numFailures: failedKeys.length,
			rooms: failedKeys,
			data: failedRooms,
		};

		if(failedKeys.length > 0) console.error(`There were failures on some of the rooms. Placing into failure file.`);
		fs.writeFileSync(basePath + "_room_failures.json", JSON.stringify(failedJsonOutput, null, 4), {mode: 0o644});
	} catch(err) {
		console.error(`Unable to parse page ${roomUrl}: ${err} @ ${err.stack}`);

		await dumpFatalError(page, outDir);

		throw err;
	} finally {
		// FIXME: While debugging it's useful to not close the page.
		// if(page) await page.close();
	}

	return Promise.resolve(roomData);
};

// To cover up the fact that there could be commas in the string, we need to surround everything with
// quotes. However, that means that we need to quote any of them that appear in the string.
// See https://en.wikipedia.org/wiki/Comma-separated_values -> "" escapes "
const cleanStringForCsv = (str: string): string => {
	return '"' + str.replace(/"/g, '""') + '"';
};
