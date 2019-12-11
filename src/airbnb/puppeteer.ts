import * as fs from "fs";

import { Browser, Page } from "puppeteer";

import { cmdParameters } from "../cmdline";
import { dumpFatalError } from "../debug";
import { maskHeadless } from "../mask";
import { installMouseHelper } from "../puppeteer_mouse_helper";

import { setCookiePreferences } from "./cookies";
import { parseHostListing } from "./host";
import { navigateToCity } from "./landing";
import { getAllListings } from "./main_page";
import { parseRoomListing } from "./room";
import { AirbnbHostId, AirbnbRoomId, IAirbnbFailureReason, IAirbnbHostFailureData, IAirbnbHostScrapeData, IAirbnbRoomFailureData, IAirbnbRoomHostScrapeData, IAirbnbRoomIdScrapeData, IAirbnbRoomScrapeData } from "./types";

const AIRBNB_URL = "https://airbnb.ca";
const DEBUG_MOUSE = true;

// FIXME: Date() shouldn't be used... should be fromDate and toDate that are used.
export const scrapeCityForRooms = async (browser: Browser, outDir: string, fileMode: number, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<IAirbnbRoomIdScrapeData> => {
	const page: Page = await browser.newPage();
	let activeUrl: string | undefined;

	const jsonRoomData: IAirbnbRoomIdScrapeData = {
		city: city,
		province: province,
		numRooms: 0,
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

		jsonRoomData.numRooms = listings.length;
		jsonRoomData.rooms = listings;

		const csvRoomData = listings.reduce((currVal, roomId) => {
			return currVal + `\n${city}, ${province}, ${roomId}`;
		}, "city, province, roomId");

		// Write out the basic information
		fs.writeFileSync(basePath + "_basic_data.json", JSON.stringify(jsonRoomData, null, 4), {mode: fileMode});
		fs.writeFileSync(basePath + "_basic_data.csv", csvRoomData, {mode: 0o644});
	} catch(err) {
		console.error(`Unable to parse page ${activeUrl}: ${err.stack ? err.stack : err}`);

		await dumpFatalError(page, outDir + "/city_errors", activeUrl);

		throw err;
	} finally {
		// NOTE: While debugging it's useful to not close the page.
		if(page) await page.close();
	}

	return Promise.resolve(jsonRoomData);
};

export const scrapeRooms = async (browser: Browser, outDir: string, fileMode: number, roomIdScrapeData: IAirbnbRoomIdScrapeData): Promise<IAirbnbRoomHostScrapeData> => {
	const roomData: IAirbnbRoomScrapeData = {
		city: roomIdScrapeData.city,
		province: roomIdScrapeData.province,
		data: {},
	};
	const roomHostInfo: IAirbnbRoomHostScrapeData = {
		city: roomData.city,
		province: roomData.province,
		hosts: [],
		coHosts: [],
	};
	const roomsToProcess = roomIdScrapeData.rooms;
	const failedRooms: {[roomId: string]: IAirbnbFailureReason} = {};

	// Spin up cooperative workers
	const workerCompletePromises = [];
	const totalLen = roomsToProcess.length;
	for(let i = 0; i < cmdParameters.maxPagesOpen; ++i) {
		const page: Page = await browser.newPage();

		workerCompletePromises.push(new Promise((resolve, _) => {
			setTimeout(processRoom, 100, page, resolve, i + 1, totalLen);
		}));
	}

	async function processRoom(page: Page, resolve: PromiseConstructor["resolve"], workerNum: number, totalNum: number) {
		let roomUrl: string | undefined;
		let first = true;
		let roomId: AirbnbRoomId;

		if(DEBUG_MOUSE) await installMouseHelper(page);

		while(typeof (roomId = roomsToProcess.pop() as string) !== "undefined") {
			const roomsRemainingAfterThis = roomsToProcess.length;
			const workerIdentification = `(W${workerNum}: ${totalNum - roomsRemainingAfterThis} of ${totalNum}): `;

			// Should look like: https://www.airbnb.ca/rooms/17300762
			roomUrl = AIRBNB_URL + "/rooms/" + roomId;

			console.log(`${workerIdentification} Navigating to url ${roomUrl} for ${roomId}`);

			try {
				await page.goto(roomUrl, {timeout: 30 * 1000, waitUntil: "networkidle0"});

				// Set cookie preferences the first time if they're there.
				if(first) {
					first = false;

					await setCookiePreferences(page);
				}

				const data = await parseRoomListing(page);

				roomData.data[roomId] = data;

				console.log(`${workerIdentification} Room info is: ${JSON.stringify(data)}`);
			} catch(err) {
				// Try to keep going even though there was a failure
				console.error(`${workerIdentification} Failure to parse room page @ ${roomUrl}: ${err}`);

				failedRooms[roomId] = {
					url: roomUrl,
					msg: err.message,
					stack: err.stack,
				};

				await dumpFatalError(page, outDir + "/room_errors", roomUrl);
			}
		}

		await page.close();

		return resolve();
	}

	// Wait for all workers to complete.
	await Promise.all(workerCompletePromises);

	// FIXME: Should detect if things didn't go well?

	// Write out to files.
	try {
		const date = new Date();
		const basePath = `${outDir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${roomIdScrapeData.city.replace(" ", "_")}_${roomIdScrapeData.province.replace(" ", "_")}_airbnb`;

		// FIXME: CSV is fragile to adding/removing fields.
		const roomIdKeys = Object.keys(roomData.data);
		const csvRoomData = roomIdKeys.reduce((currVal, roomId) => {
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

				`${roomInfo.numReviews}, ${roomInfo.latitude}, ${roomInfo.longitude},` +
				`${roomInfo.price}, ${roomInfo.guests}, ${roomInfo.bedrooms}, ${roomInfo.beds}, ${roomInfo.bathrooms}`;
		},
		"city, province, " +
		"roomId, roomUrl, title, type, hostUri, hostId, " +
		"coHostUri1, coHostUri2, coHostUri3, coHostUris4, " +
		"coHostId1, coHostId2, coHostId3, coHostId4, " +
		"num reviews, latitude, longitude, " +
		"price, guests, bedrooms, beds, bathrooms");

		// Write out the room information captured
		fs.writeFileSync(basePath + "_room_data.json", JSON.stringify(roomData, null, 4), {mode: fileMode});
		fs.writeFileSync(basePath + "_room_data.csv", csvRoomData, {mode: fileMode});

		// Write out room failures if there are any or an almost empty file if there are none.
		const failedKeys = Object.keys(failedRooms);
		const failedJsonOutput: IAirbnbRoomFailureData = {
			city: roomData.city,
			province: roomData.province,
			numRooms: roomIdKeys.length,
			rooms: failedKeys, // Just failed rooms
			numFailures: failedKeys.length,
			data: failedRooms,
		};

		if(failedKeys.length > 0) console.error(`There were failures on some of the rooms. Placing into failure file.`);
		fs.writeFileSync(basePath + "_room_failures.json", JSON.stringify(failedJsonOutput, null, 4), {mode: fileMode});

		// Write out information about the hosts.
		roomHostInfo.hosts = Object.keys(roomData.data).map((roomId) => {
			const roomInfo = roomData.data[roomId];

			return roomInfo.hostId;
		});
		roomHostInfo.coHosts = (Object.keys(roomData.data) as any).flatMap((roomId: AirbnbRoomId) => {
			const roomInfo = roomData.data[roomId];

			return roomInfo.coHostIds;
		});

		fs.writeFileSync(basePath + "_room_host_data.json", JSON.stringify(roomHostInfo, null, 4), {mode: fileMode});

		// Indicate failure if there were any failures.
		if(failedKeys.length > 0) throw new Error(`${failedKeys.length} errors parsing rooms.`);
	} catch(err) {
		console.error(`Unable to write room files: ${err.stack ? err.stack : err}`);

		throw err;
	}

	return Promise.resolve(roomHostInfo);
};

export const scrapeHosts = async (browser: Browser, outDir: string, fileMode: number, hostIdScrapeData: IAirbnbRoomHostScrapeData): Promise<void> => {
	const allHosts = hostIdScrapeData.hosts.concat(hostIdScrapeData.coHosts);
	const hostsToExamine = Array.from(new Set<string>(allHosts).values());
	const total = hostsToExamine.length;
	const failedHosts: {[hostId: string]: IAirbnbFailureReason} = {};
	const hostData: IAirbnbHostScrapeData = {
		city: hostIdScrapeData.city,
		province: hostIdScrapeData.province,
		data: {},
	};

	// Spin up cooperative workers
	const workerCompletePromises = [];
	for(let i = 0; i < cmdParameters.maxPagesOpen; ++i) {
		const page: Page = await browser.newPage();

		workerCompletePromises.push(new Promise((resolve, _) => {
			setTimeout(processHost, 100, page, resolve, i + 1, total);
		}));
	}

	await Promise.all(workerCompletePromises);

	async function processHost(page: Page, resolve: PromiseConstructor["resolve"], workerNum: number, totalNum: number) {
		let hostUrl: string | undefined;
		let first = true;
		let hostId: AirbnbHostId;

		if(DEBUG_MOUSE) await installMouseHelper(page);

		while(typeof (hostId = hostsToExamine.pop() as string) !== "undefined") {
			const roomsRemainingAfterThis = hostsToExamine.length;
			const workerIdentification = `(W${workerNum}: ${totalNum - roomsRemainingAfterThis} of ${totalNum}): `;

			// Should look like: https://www.airbnb.ca/users/show/120296681
			hostUrl = AIRBNB_URL + "/users/show/" + hostId;

			console.log(`(${workerIdentification}) Navigating to url ${hostUrl} for ${hostId}`);

			try {
				await page.goto(hostUrl, {timeout: 30 * 1000, waitUntil: "networkidle0"});

				// Set cookie preferences the first time if they're there.
				if(first) {
					first = false;

					await setCookiePreferences(page);
				}

				const data = await parseHostListing(page);

				hostData.data[hostId] = data;

				console.log(`(${workerIdentification}) Host info is: ${JSON.stringify(data)}`);
			} catch(err) {
				// Try to keep going even though there was a failure
				console.error(`failure to parse host page @ ${hostUrl}: ${err}`);

				failedHosts[hostId] = {
					url: hostUrl,
					msg: err.message,
					stack: err.stack,
				};
			}
		}

		await page.close();

		return resolve();
	}

	try {
		// Write out to files.
		const date = new Date();
		const basePath = `${outDir}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${hostIdScrapeData.city.replace(" ", "_")}_${hostIdScrapeData.province.replace(" ", "_")}_airbnb`;

		// FIXME: CSV is fragile to adding/removing fields.
		const csvHostData = Object.keys(hostData.data).reduce((currVal, hostId) => {
			const hostInfo = hostData.data[hostId];

			return currVal + `\n${hostIdScrapeData.city}, ${hostIdScrapeData.province}, ` +
				`${hostInfo.id}, ${hostInfo.url}, ${hostInfo.name}, ${hostInfo.superHost}, ` +

				`${hostInfo.hostListings.length}, ` +
				`${hostInfo.hostListings.length > 0 ? hostInfo.hostListings[0] : ""}, ` +
				`${hostInfo.hostListings.length > 1 ? hostInfo.hostListings[1] : ""}, ` +
				`${hostInfo.hostListings.length > 2 ? hostInfo.hostListings[2] : ""}, ` +
				`${hostInfo.hostListings.length > 3 ? hostInfo.hostListings[3] : ""}, ` +
				`${hostInfo.hostListings.length > 4 ? hostInfo.hostListings[4] : ""}, ` +
				`${hostInfo.hostListings.length > 5 ? hostInfo.hostListings[5] : ""}, ` +
				`${hostInfo.hostListings.length > 6 ? hostInfo.hostListings[6] : ""}, ` +
				`${hostInfo.hostListings.length > 7 ? hostInfo.hostListings[7] : ""}, ` +
				`${hostInfo.hostListings.length > 8 ? hostInfo.hostListings[8] : ""}, ` +
				`${hostInfo.hostListings.length > 9 ? hostInfo.hostListings[9] : ""}, ` +
				`${hostInfo.hostListings.length > 10 ? hostInfo.hostListings[10] : ""}, ` +
				`${hostInfo.hostListings.length > 11 ? hostInfo.hostListings[11] : ""}, ` +
				`${hostInfo.hostListings.length > 12 ? hostInfo.hostListings[12] : ""}, ` +
				`${hostInfo.hostListings.length > 13 ? hostInfo.hostListings[13] : ""}, ` +
				`${hostInfo.hostListings.length > 14 ? hostInfo.hostListings[14] : ""}, ` +
				`${hostInfo.hostListings.length > 15 ? hostInfo.hostListings[15] : ""}, ` +
				`${hostInfo.hostListings.length > 16 ? hostInfo.hostListings[16] : ""}, ` +
				`${hostInfo.hostListings.length > 17 ? hostInfo.hostListings[17] : ""}, ` +
				`${hostInfo.hostListings.length > 18 ? hostInfo.hostListings[18] : ""}, ` +
				`${hostInfo.hostListings.length > 19 ? hostInfo.hostListings[19] : ""}, ` +

				`${hostInfo.numReviews}`;
		},
		"city, province, " +
		"hostId, hostUrl, name, super host, " +
		"num listings, " +
		"host listing 1, host listing 2, host listing 3, host listing 4, host listing 5, " +
		"host listing 6, host listing 7, host listing 8, host listing 9, host listing 10, " +
		"host listing 11, host listing 12, host listing 13, host listing 14, host listing 15, " +
		"host listing 16, host listing 17, host listing 18, host listing 19, host listing 20, " +
		"num reviews");

		// Write out the host information captured
		fs.writeFileSync(basePath + "_host_data.json", JSON.stringify(hostData, null, 4), {mode: fileMode});
		fs.writeFileSync(basePath + "_host_data.csv", csvHostData, {mode: fileMode});

		// Write out host failures if there are any or an almost empty file if there are none.
		const failedKeys = Object.keys(failedHosts);
		const failedJsonOutput: IAirbnbHostFailureData = {
			city: hostIdScrapeData.city,
			province: hostIdScrapeData.province,
			numFailures: failedKeys.length,
			hosts: failedKeys,
			data: failedHosts,
		};

		if(failedKeys.length > 0) console.error(`There were failures on some of the rooms. Placing into failure file.`);
		fs.writeFileSync(basePath + "_host_failures.json", JSON.stringify(failedJsonOutput, null, 4), {mode: fileMode});
	} catch(err) {
		console.error(`Unable to write host files: ${err.stack ? err.stack : err}`);

		throw err;
	}
};

// To cover up the fact that there could be commas in the string, we need to surround everything with
// quotes. However, that means that we need to quote any of them that appear in the string.
// See https://en.wikipedia.org/wiki/Comma-separated_values -> "" escapes "
const cleanStringForCsv = (str: string): string => {
	return '"' + str.replace(/"/g, '""') + '"';
};
