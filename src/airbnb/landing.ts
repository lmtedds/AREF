// Scrape the landing page
import { ElementHandle, Page } from "puppeteer";

import { delay, fuzzyDelay, getKeyboardDelays, getMouseDelays } from "../timeouts";

import { setCookiePreferences } from "./cookies";

const fromDateInputSelector = "input[data-veloute='checkin_input']";
const toDateInputSelector = "input[data-veloute='checkout_input']";

export const navigateToCity = async (page: Page, city: string, province: string, fromDate?: Date, toDate?: Date): Promise<any> => {
	const cityStays = `${city}, ${province} stays`;

	// Set the cookie preference so that we don't have that pop over all the time.
	await setCookiePreferences(page);

	// Find the main landing page form.
	const formEle = await page.$$("div[data-veloute] form");
	if(formEle.length !== 1) throw new Error(`Unable to find 1 form element: ${formEle.length}`);

	// Input the city and add on "stays" so that we just go right to where we want.
	const cityInputs = await formEle[0].$$("input[placeholder=Anywhere]");
	if(cityInputs.length !== 1) throw new Error(`Unable to find 1 city input tag: ${cityInputs.length}`);

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
	if(!suggestion.asElement()) throw new Error(`Can't find city stays suggestion in search suggestion list`);

	await suggestion.click();

	// Add in the dates if provided
	if(fromDate && toDate) {
		await setDates(page, fromDate, toDate);
	}

	// Click the search button to move us to the next/main page.
	const submitButtons = await formEle[0].$$("button[type=submit]");
	if(submitButtons.length !== 1) throw new Error(`Unable to find 1 form submit button: ${submitButtons.length}`);

	// Success when navigation completes.
	const navPromise = page.waitForNavigation({waitUntil: "networkidle0"});

	// Seem to need to do some extra junk to get the button to recognize the click.
	await submitButtons[0].click(); // Get rid of date which has popped up...
	await delay(1 * 1000);

	// Sometimes the above click will transition the page... sometimes it won't. In case, we make sure the element still
	// exists before clicking a second time.
	await page.evaluate(() => {
		const submit = document.querySelector("div[data-veloute] form button[type=submit]") as HTMLButtonElement;
		if(submit) {
			submit.click();
		}
	});

	return navPromise;
};

const setDates = async (page: Page, fromDate: Date, toDate: Date): Promise<void> => {
	// Set from date
	await openDatePicker(page, true);

	const fromDatePicker = await getDatePicker(page);
	await selectDatePickerMonth(page, fromDatePicker, fromDate);
	await selectDatePickerDay(page, fromDatePicker, fromDate);

	// Set to date
	await openDatePicker(page, false);

	const toDatePicker = await getDatePicker(page);
	await selectDatePickerMonth(page, toDatePicker, toDate);
	await selectDatePickerDay(page, toDatePicker, toDate);

	return Promise.resolve();
};

const openDatePicker = async (page: Page, from: boolean): Promise<void> => {
	const picker = await getDatePickerInput(page, from);

	const boundingBox = await picker.boundingBox();
	if(!boundingBox) throw new Error(`No bounding box for from date picker? (${boundingBox})`);

	const pickerX = boundingBox.x + boundingBox.width / 2;
	const pickerY = boundingBox.y + boundingBox.height / 2;

	await page.mouse.move(pickerX, pickerY, {steps: 10});

	await page.mouse.down();
	await fuzzyDelay(1 * 1000);
	await page.mouse.up();

	return Promise.resolve();
};

const getDatePickerInput = async (page: Page, from: boolean): Promise<ElementHandle<Element>> => {
	const picker = await page.$$(from ? fromDateInputSelector : toDateInputSelector);
	if(picker.length !== 1) throw new Error(`Unable to find 1 ${from ? "from" : "to"} date picker: ${picker.length}`);

	return Promise.resolve(picker[0]);
};

const getDatePicker = async (page: Page): Promise<ElementHandle<Element>> => {
	const datePickers = await page.$$("div[aria-roledescription=datepicker]");
	if(datePickers.length !== 1) throw new Error(`Unable to find 1 date picker: ${datePickers.length}`);

	return Promise.resolve(datePickers[0]);
};

const selectDatePickerMonth = async (page: Page, picker: ElementHandle<Element>, date: Date): Promise<void> => {
	const desiredMonth = date.toLocaleDateString("en-CA", {month: "long"});
	const desiredYear = date.toLocaleDateString("en-CA", {year: "numeric"});

	while(true) {
		const dateText = await picker.evaluate((node) => {
			return (node as HTMLElement).innerText;
		});
		if(!dateText) throw new Error(`Unable to find monthText: ${dateText}`);

		const dateRegExp = new RegExp(`^${desiredMonth}\\s*${desiredYear}`);
		const match = dateText.match(dateRegExp);

		// If we have a match, then the month and year match. Otherwise continue looking.
		if(match) break;

		// Advance the month by 1.
		const advancer = await page.$$("div[aria-label='Move forward to switch to the next month.']");
		if(advancer.length !== 1) throw new Error(`Unable to find 1 date advancer: ${advancer.length}`);

		await advancer[0].click({delay: getMouseDelays().upDown});
		await delay(500);
	}

	return Promise.resolve();
};

// Requires the month/year to be set first
const selectDatePickerDay = async (page: Page, picker: ElementHandle<Element>, date: Date): Promise<void> => {
	const desiredDay = date.toLocaleDateString("en-CA", {day: "numeric"});

	const dateButtons = await picker.$$("div[data-visible='true'] td[role=button][aria-disabled=false]");
	if(dateButtons.length === 0) throw new Error(`Unable to find any date buttons`);

	const textPromises = dateButtons.map((dateEle) => {
		return dateEle.evaluate((node) => {
			return node.textContent;
		});
	});
	const texts = await Promise.all(textPromises);
	if(texts.length !== dateButtons.length) throw new Error(`Unable to find all text matching date buttons? ${texts.length}`);

	const index = texts.findIndex((text) => {
		return text === desiredDay;
	});
	if(index === -1) throw new Error(`Unable to find a matching date text: ${desiredDay}`);

	await dateButtons[index].click({delay: getMouseDelays().upDown});
	await delay(500);

	return Promise.resolve();
};
