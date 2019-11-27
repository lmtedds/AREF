import "source-map-support/register"; // Get typescript stack traces.

import { Browser } from "puppeteer";
import * as puppeteer from "puppeteer-extra";
import * as pluginStealth from "puppeteer-extra-plugin-stealth";

import { scrape } from "./airbnb/puppeteer";
import { cmdParameters } from "./cmdline";

import { testScrape } from "./airbnb/testing/puppeteer_test_scrape";

// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality

// add stealth plugin and use defaults (all evasion techniques)
// const pluginStealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use((pluginStealth as any)());

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
			scrape(browser, cmdParameters.out, "Red Deer", "AB");
			// scrape(browser, cmdParameters.out, "Edmonton", "AB");
			// testScrape(browser, cmdParameters.out, "Edmonton", "AB");
		});
} catch(err) {
	console.error(`error during processing: ${err}`);
}
