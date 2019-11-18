// Scrape the main page
import { ElementHandle, Page } from "puppeteer";

import { delay } from "../timeouts";
import { IMapDimensions } from "../types";

const MAP_SELECTOR = "div[role=complementary] > div[data-veloute='map/GoogleMap']";
const MAP_LABEL_SUB_SELECTOR = "label[for=home-search-map-refresh-control-checkbox]";

const PLACES_TO_STAY_SELECTOR = "h3";

const LISTING_THRESHOLD = 10;
const LARGER_THAN_THRESHOLD = 10000;

const DEBUG_RECURSE = true;

export const getAllListings = async (page: Page): Promise<string[]> => {
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

	// await zoomMap(page, mapOuterEle, 3);
	const listings = await recursiveGetListings(page, mapOuterEle, mapDimensions);

	return Promise.resolve(listings);
};

// Subdivide the map until we have fewer than the expected number of places to stay.
const recursiveGetListings = async (page: Page, mapEle: ElementHandle<Element>, dims: IMapDimensions, level: number = 0): Promise<string[]> => {
	if(DEBUG_RECURSE) console.log(`recursiveGetListings: ENTER @ level ${level}`);

	const numListings = await getNumberOfListings(page);
	if(numListings <= LISTING_THRESHOLD) {
		if(DEBUG_RECURSE) console.log(`recursiveGetListings: LEAF with ${numListings} listings @ level ${level}`);

		return getVisibleListings(page);
	}

	if(DEBUG_RECURSE) console.log(`recursiveGetListings: found ${numListings} so subdividing further.`);

	// Zoom in 1 level and then divide the map into 4 quadrants to recursively analyze each quadrant.
	let listings: string[] = [];
	await zoomMap(page, mapEle, 1);

	await moveMapCenter(page, dims, {deltaX: - dims.width * (1 / 4), deltaY: -dims.height * (1 / 4)});
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));

	await moveMapCenter(page, dims, {deltaX: dims.width * (1 / 2), deltaY: 0});
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));

	await moveMapCenter(page, dims, {deltaX: 0, deltaY: dims.height * (1 / 2)});
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));

	await moveMapCenter(page, dims, {deltaX: -dims.width * (1 / 2), deltaY: 0});
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));

	await zoomMap(page, mapEle, -1);

	if(DEBUG_RECURSE) console.log(`recursiveGetListings: EXIT @ level ${level}`);

	return Promise.resolve([]);
};

const getVisibleListings = async (page: Page): Promise<string[]> => {
	return Promise.resolve(["FIXME-GET LISTINGS"]);
};

const moveMapCenter = async (page: Page, dims: IMapDimensions, offset: {deltaX: number, deltaY: number}): Promise<any> => {
	const mapCenterX = dims.x + dims.width / 2;
	const mapCenterY = dims.y + dims.height / 2;

	const moveToX = mapCenterX + offset.deltaX;
	const moveToY = mapCenterY + offset.deltaY;

	// Move the mouse to the center of the map. Then push the left mouse button down, drag the mouse to the new location
	// and release the left mouse button. In other words: do a drag operation.
	await page.mouse.move(mapCenterX, mapCenterY, {steps: 9});

	await page.mouse.down();
	await delay(200); // FIXME: required?
	await page.mouse.move(moveToX, moveToY, {steps: 4});
	await delay(200); // FIXME: required?
	await page.mouse.up();

	// Wait for the map to update itself
	return waitForSearchToUpdate(page);
};

const getNumberOfListings = async (page: Page): Promise<number> => {
	// If there are no listings, a second h3 will appear. If there are too few listings, then another will
	// appear showing listings just outside the search area.

	const h3s = await page.$$(PLACES_TO_STAY_SELECTOR);
	if(h3s.length === 0) return Promise.reject(`No h3s?`);

	const textPromises = Array.from(h3s).map((h3) => {
		return h3.evaluate((node) => node.textContent);
	});

	const textArray = await Promise.all(textPromises);
	const text = textArray.find((textContent) => {
		if(!textContent) return false;
		return textContent.search(/\s+places\s+to\s+stay/) >= 0;
	});
	if(!text) return Promise.reject(`Unable to find appropriate text from the h3s: ${text}/${JSON.stringify(textArray)}`);

	// Either of the form:
	// 1) "More places to stay nearby",
	// 2) "1 places to stay", or
	// 3) "300+ places to stay"
	const str = text.replace(/\s+places\s+to\s+stay/, "");
	let num;
	if(str.search(/\s/) >= 0) {
		num = 0;
	} else if(str.search(/\+/) >= 0) {
		num = LARGER_THAN_THRESHOLD;
	} else {
		num = Number(str);
	}

	return Promise.resolve(num);
};

const getGoogleMap = async (page: Page): Promise<ElementHandle<Element>> => {
	const divs = await page.$$(MAP_SELECTOR);
	if(divs.length !== 1) return Promise.reject(`Unable to get 1 map div: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getMapDimensions = async (page: Page): Promise<IMapDimensions> => {
	const mapDiv = await getGoogleMap(page);

	const bbox = await mapDiv.boundingBox();
	if(!bbox) return Promise.reject(`Unable to get map bounding box`);

	return Promise.resolve(bbox);
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
	const labelEles = await map.$$(MAP_LABEL_SUB_SELECTOR);
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
	}

	return waitForSearchToUpdate(page);
};

// When something changes on the map, everything needs to be updated. This may take a while,
// so wait for both the map to indicate that it's no longer searching and the listings on the page
// have stabilized.
const waitForSearchToUpdate = async (page: Page): Promise<any> => {
	const waitForMapSearchLabel = page.waitForFunction((mapSel, mapLabelSubSel) => {
			const spanEles = document.querySelectorAll(`${mapSel} ${mapLabelSubSel} > div > span`);
			if(spanEles.length !== 1) return null;

			return spanEles[0].textContent!.search("Search as I") >= 0;
		},
		{polling: "mutation"},
		MAP_SELECTOR,
		MAP_LABEL_SUB_SELECTOR,
	);

	const waitForListingsToChange = page.waitForSelector(`${PLACES_TO_STAY_SELECTOR}`);

	await Promise.all([
		waitForMapSearchLabel,
		waitForListingsToChange,
	]);

	// FIXME: This is missing something... so just give an extra delay to fudge it.
	return delay(3 * 1000);
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
