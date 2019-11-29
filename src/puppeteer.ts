import "source-map-support/register"; // Get typescript stack traces.

import * as fs from "fs";

import { Browser } from "puppeteer";
import * as puppeteer from "puppeteer-extra";
import * as pluginStealth from "puppeteer-extra-plugin-stealth";

import { scrapeCityForRooms, scrapeRooms } from "./airbnb/puppeteer";
import { IAirbnbRoomIdScrapeData } from "./airbnb/types";
import { cmdParameters } from "./cmdline";

// import { testScrape } from "./airbnb/testing/puppeteer_test_scrape";

// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality

// add stealth plugin and use defaults (all evasion techniques)
// const pluginStealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use((pluginStealth as any)());

const puppeteerLaunchOpts = {
	headless: false,
	defaultViewport: {
		width: 1600,
		height: 1200,
	},
};

try {
	puppeteer.launch(puppeteerLaunchOpts)
		.then(async (browser: Browser) => {
			// Where do we get our list of rooms to parse?
			let roomData: IAirbnbRoomIdScrapeData;
			if(cmdParameters.basicFile) {
				roomData = JSON.parse(fs.readFileSync(cmdParameters.basicFile, {encoding: "utf-8", flag: "r"})) as IAirbnbRoomIdScrapeData;
			} else {
				roomData = await scrapeCityForRooms(browser, cmdParameters.out, cmdParameters.filePermissions, cmdParameters.city as string, cmdParameters.province as string);
			}

			// Scrape room information
			await scrapeRooms(browser, cmdParameters.out, cmdParameters.filePermissions, roomData);

			await browser.close();
			console.log(`done processing`);
		});
} catch(err) {
	console.error(`error during processing: ${err}`);
}
