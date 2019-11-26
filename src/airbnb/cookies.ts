// Functionality related to cookie handling
import { ElementHandle, Page } from "puppeteer";

import { getMouseDelays } from "../timeouts";

export const setCookiePreferences = async (page: Page): Promise<void> => {
	// Since we're using Puppeteer, we'll have cookies for the session and they'll be deleted automatically. However, we
	// don't really want everything to be tracked, so let's attempt to turn off:
	// Performance Cookies, Functional Cookies, Targetting Cookies,
	const preferencesButtonEles = await page.$$("div[class*=optanon] button[title*=Cookie]");
	if(preferencesButtonEles.length !== 1) throw new Error(`Unable to find 1 cookie preference button ele: ${preferencesButtonEles.length}`);

	await preferencesButtonEles[0].click({delay: getMouseDelays().upDown});

	// Find the pop up (wait for it first)
	const cookieMenu = await page.waitForSelector("#optanon-menu", {visible: true});
	if(!cookieMenu) throw new Error(`Unable to find 1 menu for cookies`);

	await turnOffCookieType(page, cookieMenu, "Performance Cookies");
	await turnOffCookieType(page, cookieMenu, "Functional Cookies");
	await turnOffCookieType(page, cookieMenu, "Targeting Cookies");

	// Click the save settings to commit all these changes.
	const popBottomButtonEles = await page.$$("#optanon-popup-bottom button[title='Save Settings']");
	if(popBottomButtonEles.length !== 1) throw new Error(`Unable to find the save settings button for ${name} cookies: ${popBottomButtonEles.length}`);

	return popBottomButtonEles[0].click({delay: getMouseDelays().upDown});
};

const turnOffCookieType = async (page: Page, cookieMenu: ElementHandle<Element>, name: string) => {
	const cookieMenuItemEle = await cookieMenu.$(`li[title='${name}']`);
	if(!cookieMenuItemEle) throw new Error(`Unable to find ${name} cookies menu entry`);

	// click on menu entry and wait for the main panel to update
	cookieMenuItemEle.click();
	await page.waitForSelector(`#optanon-menu li.menu-item-selected[title='${name}']`, {visible: true});

	// Main panel updated. Turn off the checkbox.
	const checkboxEles = await page.$$(`#optanon-popup-body-right input.legacy-group-status[type=checkbox]`);
	if(checkboxEles.length !== 1) throw new Error(`Can't find 1 ${name} cookie checkbox: ${checkboxEles.length}`);

	return checkboxEles[0].click({delay: getMouseDelays().upDown});
};
