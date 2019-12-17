// NOTE: Requires node 12+

import "source-map-support/register"; // Get typescript stack traces.

import * as fs from "fs";

import { Browser } from "puppeteer";
import * as puppeteer from "puppeteer-extra";
import * as pluginStealth from "puppeteer-extra-plugin-stealth";

import { scrapeCityForRooms, scrapeHosts, scrapeRooms } from "./airbnb/puppeteer";
import { IAirbnbRoomHostScrapeData, IAirbnbRoomIdScrapeData } from "./airbnb/types";
import { cmdParameters } from "./cmdline";
import { logger } from "./logging";

puppeteer.use((pluginStealth as any)());

const puppeteerLaunchOpts = {
	headless: cmdParameters.headless,
	defaultViewport: {
		width: 1600,
		height: 1200,
	},
	args: [
		"--disable-background-timer-throttling",
		"--disable-backgrounding-occluded-windows",
		"--disable-renderer-backgrounding",
		"--disable-gpu",
		"--enable-automation",
		"--disable-ipc-flooding-protection",
	],
};

try {
	puppeteer.launch(puppeteerLaunchOpts)
		.then(async (browser: Browser) => {
			try {
				let hostData: IAirbnbRoomHostScrapeData;

				// If there is a host id file provided, don't scrape rooms.
				if(!cmdParameters.hostIdFile) {
					// Where do we get our list of rooms to parse?
					let roomData: IAirbnbRoomIdScrapeData;
					if(cmdParameters.roomIdFile) {
						roomData = JSON.parse(fs.readFileSync(cmdParameters.roomIdFile, {encoding: "utf-8", flag: "r"})) as IAirbnbRoomIdScrapeData;
					} else {
						roomData = await scrapeCityForRooms(browser, cmdParameters.out, cmdParameters.filePermissions,
							cmdParameters.city as string, cmdParameters.province as string,
							cmdParameters.startDate, cmdParameters.endDate);
					}

					// Scrape room information
					hostData = await scrapeRooms(browser, cmdParameters.out, cmdParameters.filePermissions, roomData);
				} else {
					hostData = JSON.parse(fs.readFileSync(cmdParameters.hostIdFile, {encoding: "utf-8", flag: "r"})) as IAirbnbRoomHostScrapeData;
				}

				// Scrape host information
				await scrapeHosts(browser, cmdParameters.out, cmdParameters.filePermissions, hostData);
			} catch(err) {
				logger.error(`Didn't finish processing perfectly: ${err.stack ? err.stack : err}`);
			} finally {
				logger.info(`done processing - closing browser`);

				await browser.close();

				process.exit(0);
			}
		});
} catch(err) {
	logger.error(`error during launch: ${err}`);

	process.exit(-1);
}
