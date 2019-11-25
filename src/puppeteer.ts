import "source-map-support/register"; // Get typescript stack traces.

import { Browser } from "puppeteer";

import { scrape, testScrape } from "./airbnb/puppeteer";

// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require("puppeteer-extra")

// add stealth plugin and use defaults (all evasion techniques)
const pluginStealth = require("puppeteer-extra-plugin-stealth")
puppeteer.use(pluginStealth());

const launchOpts = {
	headless: false,
	defaultViewport: {
		width: 1600,
		height: 1200,
	},
};

try {
	puppeteer.launch(launchOpts)
		.then((browser: Browser) => {
			testScrape(browser, "Edmonton", "AB");
		});
} catch(err) {
	console.error(`error during processing: ${err}`);
}
