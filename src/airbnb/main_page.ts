// Scrape the main page
import { ElementHandle, Page } from "puppeteer";

import { delay } from "../timeouts";
import { IMapDimensions } from "../types";

const mapSelector = "div[role=complementary] > div[data-veloute='map/GoogleMap']";
const mapSearchLabelSubSelector = "label[for=home-search-map-refresh-control-checkbox]";

export const getAllListings = async (page: Page): Promise<string[]> => {
	// Subdivide the map until we have fewer than the expected number of places to stay.
	let mapOuterEle;
	try {
		mapOuterEle = await getGoogleMap(page);
	} catch(err) {
		// FIXME: Should be able to rescale the screen to make the map fit and then try again. However,
		//        it's not worth the initial effort.
		throw new Error(`Can't get google map. Most likely the screen is too small. ${err} ${err.stack}`);
	}

	const mapDimensions = await getMapDimensions(page);
	console.error(`dims are: ${JSON.stringify(mapDimensions)}`);

	await zoomMap(page, mapOuterEle, 3);

	return Promise.resolve([]);
};

const getGoogleMap = async (page: Page): Promise<ElementHandle<Element>> => {
	// FIXME: REmove old.
	// const divs = document.querySelectorAll("div[role=complementary] > div[data-veloute='map/GoogleMap']");
	// console.assert(divs.length === 1, `should be only 1 google map div: found ${divs.length}`);

	// return divs[0] as HTMLElement;

	const divs = await page.$$(mapSelector);
	if(divs.length !== 1) return Promise.reject(`Unable to get 1 map div: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getMapDimensions = async (page: Page): Promise<IMapDimensions> => {
	const mapDiv = await getGoogleMap(page);

	return mapDiv.evaluate((node) => {
		return {
			h: node.clientHeight,
			w: node.clientWidth,
		};
	});
};

const getMapZoomIn = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const buttonEles = await map.$$(`button[aria-label='Zoom in']`);
	if(buttonEles.length !== 1) return Promise.reject(`Unable to find 1 zoom in button: ${buttonEles.length}`);

	return Promise.resolve(buttonEles[0]);
};

const getMapZoomOut = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const buttonEles = await map.$$(`button[aria-label='Zoom out']`);
	if(buttonEles.length !== 1) return Promise.reject(`Unable to find 1 zoom out button: ${buttonEles.length}`);

	return Promise.resolve(buttonEles[0]);
};

const getMapSearchAsMapIsMoved = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const labelEles = await map.$$(mapSearchLabelSubSelector);
	if(labelEles.length !== 1) return Promise.reject(`Unable to find 1 zoom out button: ${labelEles.length}`);

	return Promise.resolve(labelEles[0]);
};

const zoomMap = async (page: Page, map: ElementHandle<Element>, relativeLevel: number): Promise<void> => {
	const zoom = relativeLevel > 0 ? await getMapZoomIn(map) : await getMapZoomOut(map);
	const searchLabel = await getMapSearchAsMapIsMoved(map);

	let zoomFactor = Math.abs(relativeLevel);
	while(zoomFactor > 0) {
		--zoomFactor;

		// Click and wait for map update to complete
		await zoom.click();

		await delay(100);

		await page.waitForFunction((mapSel, mapLabelSubSel) => {
				const spanEles = document.querySelectorAll(`${mapSel} ${mapLabelSubSel} > div > span`);
				if(spanEles.length !== 1) return null;

				return spanEles[0].textContent!.search("Search as I") >= 0;
			},
			{polling: "mutation"},
			mapSelector,
			mapSearchLabelSubSelector,
		);
	}

	return Promise.resolve();
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
