// Surveys.
import { Page } from "puppeteer";

import { delay } from "../timeouts";

// There seem to occasionally be surveys. They seem to be form based. Not sure if they appear the cookies are
// modified.
export const findSurvey = async (page: Page): Promise<boolean> => {
	const forms = await page.$$(".QSISlider");
	if(forms.length === 0) return Promise.resolve(false);
	if(forms.length > 1) return Promise.reject(`Too many forms found when looking for a survey: ${forms.length}`);

	return Promise.resolve(true);
};

export const closeSurvey = async (page: Page): Promise<void> => {
	const closeXs = await page.$$(".QSISlider img");
	if(closeXs.length !== 1) return Promise.reject(`Unable to find survey closing X: ${closeXs.length}`);

	await closeXs[0].evaluate((node) => {
		(node as HTMLElement).click();
	});

	return delay(2 * 1000);
};
