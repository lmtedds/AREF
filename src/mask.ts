// Some routines for masking headless chrome
// See some pages like these for instance:
// https://antoinevastel.com/bot%20detection/2018/01/17/detect-chrome-headless-v2.html
// https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
// https://intoli.com/blog/making-chrome-headless-undetectable/
// https://gist.github.com/tegansnyder/c3aeae4d57768c58247ae6c4e5acd3d1
//
import { Page } from "puppeteer";

import { logger } from "./logging";

export const maskHeadless = async (page: Page): Promise<void> => {
	await maskUserAgent(page);

	return Promise.resolve();
};

// We want something like:                Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36
// In headless mode it is something like: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/79.0.3945.0 Safari/537.36
const maskUserAgent = async (page: Page): Promise<void> => {
	const userAgent = await getUserAgent(page);
	const newUserAgent = userAgent.replace("HeadlessChrome", "Chrome");

	logger.info(`user agent is "${userAgent}" becomes "${newUserAgent}". Has headless: ${userAgent.search(/headless/i) >= 0}`);

	return page.setUserAgent(newUserAgent);
};

export const getUserAgent = async (page: Page): Promise<string> => {
	return page.evaluate(() => {
		return navigator.userAgent;
	});
};
