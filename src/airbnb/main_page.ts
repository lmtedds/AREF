// Scrape the main page
import { ElementHandle, Page } from "puppeteer";

import { delay, fuzzyDelay } from "../timeouts";
import { IMapDimensions } from "../types";

import { getRoomIdForThisPage } from "./room";
import { closeSurvey, findSurvey } from "./survey";

const MAP_SELECTOR = "div[role=complementary] > div[data-veloute='map/GoogleMap']";
const MAP_LABEL_SUB_SELECTOR = "label[for=home-search-map-refresh-control-checkbox]";

const PLACES_TO_STAY_SELECTOR = "h3";

const LISTING_SPAN_HEIGHT = 60;
const LISTING_SPAN_WIDTH = 18;

const LISTING_THRESHOLD = 18; // 1 page of listings so we don't have to figure out how to page
const LARGER_THAN_THRESHOLD = +Infinity;

const DEBUG_SEARCH = true;

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
	console.log(`map dims are: ${JSON.stringify(mapDimensions)}`);

	// Close survey if it's there.
	await fuzzyDelay(5 * 1000);
	const surveyFound = await findSurvey(page);
	console.log(`survey found`);
	if(surveyFound) await closeSurvey(page);

	const listings = await recursiveGetListings(page, mapOuterEle, mapDimensions);

	const uniqueListings = Array.from(new Set<string>(listings).values());

	console.log(`${listings.length} rooms found. ${uniqueListings.length} are unique.`);
	return Promise.resolve(uniqueListings);
};

// Subdivide the map until we have fewer than the expected number of places to stay.
const recursiveGetListings = async (page: Page, mapEle: ElementHandle<Element>, dims: IMapDimensions, level: number = 0): Promise<string[]> => {
	if(DEBUG_SEARCH) console.log(`recursiveGetListings: ENTER @ level ${level}`);

	const numListings = await getNumberOfListings(page);
	if(numListings <= LISTING_THRESHOLD) {
		if(DEBUG_SEARCH) console.log(`recursiveGetListings: LEAF with ${numListings} listings @ level ${level}`);

		return getVisibleListings(page);
	}

	if(DEBUG_SEARCH) console.log(`recursiveGetListings: found ${numListings} @ ${level} so subdividing further.`);

	// Zoom in 1 level and then divide the map into 4 quadrants to recursively analyze each quadrant.
	let listings: string[] = [];

	await moveMapCenter(page, dims, {deltaX: - dims.width * (1 / 4), deltaY: -dims.height * (1 / 4)});
	await zoomMap(page, mapEle, 1);
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));
	await zoomMap(page, mapEle, -1);

	await moveMapCenter(page, dims, {deltaX: dims.width * (1 / 2), deltaY: 0});
	await zoomMap(page, mapEle, 1);
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));
	await zoomMap(page, mapEle, -1);

	await moveMapCenter(page, dims, {deltaX: 0, deltaY: dims.height * (1 / 2)});
	await zoomMap(page, mapEle, 1);
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));
	await zoomMap(page, mapEle, -1);

	await moveMapCenter(page, dims, {deltaX: -dims.width * (1 / 2), deltaY: 0});
	await zoomMap(page, mapEle, 1);
	listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));
	await zoomMap(page, mapEle, -1);

	if(DEBUG_SEARCH) console.log(`recursiveGetListings: EXIT @ level ${level}: ${JSON.stringify(listings)}`);

	return Promise.resolve(listings);
};

const getTagAtCoords = async (page: Page, atX: number, atY: number): Promise<string> => {
	const tagUnder = await page.evaluate((x, y) => {
			const ele = document.elementFromPoint(x, y);
			return ele ? ele.tagName : null;
		},
		atX,
		atY,
	);
	if(!tagUnder) return Promise.reject(`No element under the cursor? Off the page?: ${atX} ${atY}`);

	return Promise.resolve(tagUnder.toLowerCase());
};

const isPriceAtCoords = async (page: Page, atX: number, atY: number): Promise<boolean> => {
	const eleUnder = await page.evaluateHandle((x, y) => {
			return document.elementFromPoint(x, y);
		},
		atX,
		atY,
	);
	if(!eleUnder) return Promise.reject(`No element under the cursor? Off the page?: ${atX} ${atY}`);

	// Here are some observations:
	// If this is a price, then there is a button element somewhere close by (within a few levels of parent or children). Map doesn't have a parent button.
	// If there is more than 1 listing being shown then there is only 1 "$" visible in the textContent of the element. This unfortunatley isn't reliable.
	const priceBubble = await eleUnder.evaluate((node) => {
		// Has a parent button?
		const button = node.closest("button");

		if(button) return true;

		// Child is a button?
		const childButton = node.querySelector(":scope > button");

		return !!childButton;
	});

	return Promise.resolve(priceBubble);
};

const moveMapCenter = async (page: Page, dims: IMapDimensions, offset: {deltaX: number, deltaY: number}): Promise<any> => {
	const mapCenterX = dims.x + dims.width / 2;
	const mapCenterY = dims.y + dims.height / 2;

	let mapGrabPointX = mapCenterX;
	let mapGrabPointY = mapCenterY;

	// Make sure there isn't a listing under this point otherwise mouse down won't grab the map.
	while(await isPriceAtCoords(page, mapGrabPointX, mapGrabPointY)) {
		// FIXME: Change the dimensions by a bit less than the size of the listing and check again.
		if(DEBUG_SEARCH) console.error(`WARN: listing detected under proposed map anchor point ${mapGrabPointX} ${mapGrabPointY}. Trying at new location.`);
		mapGrabPointX -= LISTING_SPAN_WIDTH / 1.5;
		mapGrabPointY -= LISTING_SPAN_HEIGHT / 1.5;

		// FIXME: SHould limit this to a certain number of iterations.
		// FIXME: SHould make sure we don't exceed the bounds of the map.
	}

	const moveToX = mapGrabPointX + offset.deltaX;
	const moveToY = mapGrabPointY + offset.deltaY;

	// FIXME: This doesn't work all the time. Not sure why. There is at least 1 understood failure mode which should be handled above.
	// Move the mouse to the center of the map. Then push the left mouse button down, drag the mouse to the new location
	// and release the left mouse button. In other words: do a drag operation.
	await page.mouse.move(mapCenterX, mapCenterY, {steps: 11});

	await page.mouse.down();
	await delay(1 * 1000); // FIXME: Not sure if this helps, but sometimes the map doesn't move...
	await page.mouse.move(moveToX, moveToY, {steps: 2});
	await delay(500); // FIXME: required?
	await page.mouse.up();

	// Wait for the map to update itself
	return waitForSearchToUpdate(page);
};

const getVisibleListingsOuter = async (page: Page): Promise<ElementHandle<Element> | undefined> => {
	// If there are no listings, a second h3 will appear. If there are too few listings, then another will
	// appear showing listings just outside the search area.
	const h3s = await page.$$(PLACES_TO_STAY_SELECTOR);
	if(h3s.length === 0) return Promise.reject(`No h3s?`);

	const textArray = await Promise.all(
		Array.from(h3s).map((h3) => {
			return h3.evaluate((node) => node.textContent);
		}),
	);

	// NOTE: This relies on the order of the elements. We assume, reasonably, that the
	//       places to stay list will come before the more places to stay nearby list.
	const index = textArray.findIndex((textContent) => {
		if(!textContent) return false;
		return textContent.search(/\s+places\s+to\s+stay/) >= 0;
	});
	if(index < 0) return Promise.resolve(undefined);

	const outerElePromise = h3s[index].evaluateHandle((node) => {
		return node.closest("div[itemprop=itemList] > div");
	});

	return Promise.resolve(outerElePromise as Promise<ElementHandle<Element>>);
};

const getVisibleListings = async (page: Page): Promise<string[]> => {
	const outer = await getVisibleListingsOuter(page);
	if(!outer) return Promise.reject(`unable to find outer listing container: ${outer}`);

	const listItems = await outer.$$("div[itemprop=itemListElement]");
	if(listItems.length === 0) return Promise.reject(`Outer container has no list items? ${listItems.length}`);

	// Make sure we filter out non string listings. Shouldn't happen though.
	const roomUrls = (await Promise.all(
		listItems.map((item) => {
			return item.evaluate((node) => {
				const metas = node.querySelectorAll(":scope > meta[itemprop=url]");
				if(metas.length !== 1) return null;

				return metas[0].getAttribute("content");
			});
		}),
	))
	.filter((room) => {
		if(room) return true;

		console.error(`room listing is null? ${room}`);
		return false;
	}) as string[];

	const roomIds = roomUrls.map((roomUrl) => {
		return getRoomIdForThisPage(page, roomUrl);
	}) ;

	return Promise.resolve(roomIds);
};

const getNumberOfListings = async (page: Page): Promise<number> => {
	// If there are no listings, a second h3 will appear. If there are too few listings, then another will
	// appear showing listings just outside the search area.
	const ele = await getVisibleListingsOuter(page);
	if(!ele) return Promise.reject(`unable to find outer listing container: ${ele}`);

	const text = await ele.evaluate((node) => {
		const h3 = node.querySelector("h3");
		if(!h3) return null;

		return h3.textContent;
	});
	if(!text) return Promise.reject(`unable to find outer listing container's text?: ${text}`);

	// Either of the form:
	// 1) "More places to stay nearby" (i.e. no listings),
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
	return delay(4 * 1000);
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
