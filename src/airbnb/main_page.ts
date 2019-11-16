// Scrape the main page
import { ElementHandle, Page } from "puppeteer";

const getGoogleMap = async (page: Page): Promise<ElementHandle<Element>> => {
	// FIXME: REmove old.
	// const divs = document.querySelectorAll("div[role=complementary] > div[data-veloute='map/GoogleMap']");
	// console.assert(divs.length === 1, `should be only 1 google map div: found ${divs.length}`);

	// return divs[0] as HTMLElement;

	const divs = await page.$$("div[role=complementary] > div[data-veloute='map/GoogleMap']");

	if(divs.length !== 1) return Promise.reject(`Unable to get 1 map div: ${JSON.stringify(divs)}`);

	return Promise.resolve(divs[0]);
};

const getMapDimensions = async (page: Page): Promise<{w: number; h: number}> => {
	const mapDiv = await getGoogleMap(page);

	return mapDiv.evaluate((node) => {
		return {
			h: node.clientHeight,
			w: node.clientWidth,
		};
	});
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
