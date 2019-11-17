import "source-map-support/register"; // Get typescript stack traces.

import { launch } from "puppeteer";

import { scrape } from "./airbnb/puppeteer";

const launchOpts = {
	headless: false,
	defaultViewport: {
		width: 1600,
		height: 1200,
	},
};

try {
	launch(launchOpts)
		.then(scrape);
} catch(err) {
	console.error(`error during processing: ${err}`);
}
