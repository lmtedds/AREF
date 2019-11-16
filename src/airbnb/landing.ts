// Scrape the landing page
import { ElementHandle, Page } from "puppeteer";

import { delay, getKeyboardDelays, getMouseDelays } from "../timeouts";

import { setCookiePreferences } from "./cookies";

export const navigateToCity = async (page: Page, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<any> => {
	const cityStays = `${city}, ${province} stays`;

	// Set the cookie preference so that we don't have that pop over all the time.
	// await setCookiePreferences(page);

	// Find the main landing page form.
	const formEle = await page.$$("div[data-veloute] form");
	if(formEle.length !== 1) return Promise.reject(`Unable to find 1 form element: ${formEle.length}`);

	// Input the city and add on "stays" so that we just go right to where we want.
	const cityInputs = await formEle[0].$$("input[placeholder=Anywhere]");
	if(cityInputs.length !== 1) return Promise.reject(`Unable to find 1 city input tag: ${cityInputs.length}`);

	// Type in and and return.
	await cityInputs[0].type(cityStays, {delay: getKeyboardDelays().interCharacter});

	// Wait for the search to catch up
	await delay(2 * 1000);

	// Now, search the drop down search list for the one we want and choose that. It seems to make a difference.
	const suggestion = await page.evaluateHandle((cityMatchStr) => {
		const suggestions = document.querySelectorAll("form ul[aria-label='Search suggestions']");
		if(suggestions.length !== 1) return null;

		const lis = Array.from(suggestions[0].querySelectorAll("li > ul > li[role=option]"));
		if(lis.length === 0) return null;

		// Sometimes the search results will provide something like "Calgary, AB stays" and other
		// times it will provide "Calgary AB stays". Note the difference in commas.
		return lis.find((li) => {
			const searchRE = new RegExp(cityMatchStr);
			return li.textContent!.search(searchRE) >= 0;
		});
	}, `${city}.*${province}\\sstays`) as ElementHandle<Element>;
	if(!suggestion) return Promise.reject(`Can't find city stays suggestion in search suggestion list`);

	await suggestion.click();

	// Add in the dates if provided
	if(fromDate && toDate) {
		return Promise.reject(`not implemented`);
	}

	// Click the search button to move us to the next/main page.
	const submitButtons = await formEle[0].$$("button[type=submit]");
	if(submitButtons.length !== 1) return Promise.reject(`Unable to find 1 form submit button: ${submitButtons.length}`);

	// Seem to need to do some extra junk to get the button to recognize the click.
	await submitButtons[0].click(); // Get rid of date which has popped up...
	await delay(1 * 1000);

	// page.evaluate(() => { (document.querySelector("div[data-veloute] form") as any).submit() });

	// Success when navigation completes.
	return Promise.all([
		page.waitForNavigation({waitUntil: "networkidle2"}),
		// submitButtons[0].click({delay: getMouseDelays().upDown}), // FIXME: Doesn't work for some reason... so do it on the other side.
		page.evaluate(() => { (document.querySelector("div[data-veloute] form button[type=submit]") as any).click(); }),
	]);
};
