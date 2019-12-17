// Scrape the main page
import { ElementHandle, Page } from "puppeteer";

import { logger } from "../logging";
import { delay, fuzzyDelay } from "../timeouts";
import { IMapDimensions } from "../types";

import { getRoomIdForThisPage } from "./room";
import { closeSurvey, findSurvey } from "./survey";

const MAP_SELECTOR = "div[data-veloute='map/GoogleMap']";
const MAP_LABEL_SUB_SELECTOR = "label[for=home-search-map-refresh-control-checkbox]";

const PLACES_TO_STAY_SELECTOR = "h3";

const LISTING_SPAN_HEIGHT = 60;
const LISTING_SPAN_WIDTH = 18;

const LISTING_THRESHOLD = 17 * 18;
const LARGER_THAN_THRESHOLD = +Infinity;

const DEBUG_SEARCH = true;

export const getAllListings = async (page: Page): Promise<string[]> => {
	let mapOuterEle;
	try {
		await page.waitForSelector(MAP_SELECTOR);
		await fuzzyDelay(1 * 1000); // Wait for it to be populated.
		mapOuterEle = await getGoogleMap(page);
	} catch(err) {
		// FIXME: Should be able to rescale the screen to make the map fit and then try again. However,
		//        it's not worth the initial effort.
		throw new Error(`Can't get google map. Most likely the screen is too small. ${err.stack ? err.stack : err}`);
	}

	const mapDimensions = await getMapDimensions(page);
	logger.info(`map dims are: ${JSON.stringify(mapDimensions)}`);

	// Close survey if it's there.
	await fuzzyDelay(5 * 1000);
	const surveyFound = await findSurvey(page);
	logger.info(`survey found`);
	if(surveyFound) await closeSurvey(page);

	const listings = await recursiveGetListings(page, mapOuterEle, mapDimensions);

	const uniqueListings = Array.from(new Set<string>(listings).values());

	logger.info(`${listings.length} rooms found. ${uniqueListings.length} are unique.`);
	return Promise.resolve(uniqueListings);
};

// Subdivide the map until we have fewer than the expected number of places to stay.
// NOTE: This isn't perfect as zooming in and then immediately zooming out doesn't yield the same number
//       of listings. This seems to be a bug on airbnb's part.
const recursiveGetListings = async (page: Page, mapEle: ElementHandle<Element>, dims: IMapDimensions, level: number = 0): Promise<string[]> => {
	if(DEBUG_SEARCH) logger.info(`recursiveGetListings: ENTER @ level ${level}`);

	const numListings = await getNumberOfListings(page);
	if(numListings <= LISTING_THRESHOLD) {
		if(DEBUG_SEARCH) logger.info(`recursiveGetListings: EXIT -> LEAF with ${numListings} listings @ level ${level}`);

		return getMultiPageListings(page, numListings);
	}

	// if(level >= 2) {
	// 	logger.info(`recursiveGetListings: DEBUG: Short circuit with ${numListings}`);
	// 	return Promise.resolve(["Short circuit debug"]); // FIXME: Temp debug
	// }

	if(DEBUG_SEARCH) logger.info(`recursiveGetListings: found ${numListings} @ ${level} so subdividing further.`);

	// Zoom in 1 level and then divide the map into 4 quadrants to recursively analyze each quadrant.
	let listings: string[] = [];

	// Divide map into 4 quadrants and recurse into each.
	const pattern: Array<{x: number, y: number, recurse: boolean}> = [
		{x: -1 / 4, y: -1 / 4, recurse: true},
		{x:  1 / 2, y:    0, recurse: true},
		{x:    0, y:  1 / 2, recurse: true},
		{x: -1 / 2, y:    0, recurse: true},
		{x:  1 / 4, y: -1 / 4, recurse: false}, // Back to starting position
	];

	// Divide map into 9 quadrants and recurse into each.
	// const pattern: Array<{x: number, y: number, recurse: boolean}> = [
	// 	{x: -1 / 3, y: -1 / 3, recurse: true},
	// 	{x:  1 / 3, y:    0, recurse: true},
	// 	{x:  1 / 3, y:    0, recurse: true},
	// 	{x:    0, y:  1 / 3, recurse: true},
	// 	{x: -1 / 3, y:    0, recurse: true},
	// 	{x: -1 / 3, y:    0, recurse: true},
	// 	{x:    0, y:  1 / 3, recurse: true},
	// 	{x:  1 / 3, y:    0, recurse: true},
	// 	{x:  1 / 3, y:    0, recurse: true},
	// 	{x: -1 / 3, y: -1 / 3, recurse: false}, // Back to starting position
	// ];

	// Confirm that the pattern is valid.
	const {x, y} = pattern.reduce((prevVal, currVal) => {
		prevVal.x += currVal.x;
		prevVal.y += currVal.y;

		return prevVal;
	}, {x: 0, y: 0});
	logger.assert(x === 0 && y === 0, `ERROR: Path doesn't return to start. X sum is ${x}, y sum is ${y}`);

	for(const delta of pattern) {
		await moveMapCenter(page, dims, {deltaX: dims.width * delta.x, deltaY: dims.height * delta.y});

		if(delta.recurse) {
			if(DEBUG_SEARCH) logger.info(`recursiveGetListings: RECURSE into level ${level + 1} @ ${JSON.stringify(delta)}`);
			await zoomMap(page, mapEle, 1);
			listings = listings.concat(await recursiveGetListings(page, mapEle, dims, level + 1));
			await zoomMap(page, mapEle, -1);
			if(DEBUG_SEARCH) logger.info(`recursiveGetListings: RECURSE return from level ${level + 1} @ ${JSON.stringify(delta)} with ${listings.length} total listings`);
		}
	}

	listings = Array.from(new Set<string>(listings).values());
	if(DEBUG_SEARCH) logger.info(`recursiveGetListings: EXIT @ level ${level}: ${listings.length} listings vs ${numListings}: ${JSON.stringify(listings)}`);

	return Promise.resolve(listings);
};

const isPriceAtCoords = async (page: Page, atX: number, atY: number): Promise<boolean> => {
	const eleUnder = await page.evaluateHandle((x, y) => {
			return document.elementFromPoint(x, y);
		},
		atX,
		atY,
	);
	if(!eleUnder) throw new Error(`No element under the cursor? Off the page?: ${atX} ${atY}`);

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
		// Change the dimensions by a bit less than the size of the listing and check again.
		// Make sure the fuzzing is in the opposite direction of where we need to move so that the move will be to a spot on the map.
		const modX = -1 * Math.sign(offset.deltaX) * (LISTING_SPAN_WIDTH / 2);
		const modY = -1 * Math.sign(offset.deltaY) * (LISTING_SPAN_HEIGHT / 2);

		if(DEBUG_SEARCH) logger.error(`moveMapCenter: WARN: listing detected under proposed map anchor point ${mapGrabPointX} ${mapGrabPointY}. Fuzzing by ${modX} and ${modY}.`);

		mapGrabPointX = mapGrabPointX + modX;
		mapGrabPointY = mapGrabPointY + modY;

		// FIXME: SHould limit this to a certain number of iterations.
		// FIXME: Should implement some kind of random approach in the case we can't find a spot on the map that works.
		// FIXME: Clamp at map edges for both from and to operations
	}

	const moveToX = mapGrabPointX + offset.deltaX;
	const moveToY = mapGrabPointY + offset.deltaY;

	// Move the mouse to the center of the map. Then push the left mouse button down, drag the mouse to the new location
	// and release the left mouse button. In other words: do a drag operation.
	await page.mouse.move(mapGrabPointX, mapGrabPointY, {steps: 5});

	// if(DEBUG_SEARCH) {
	// 	logger.info(`moveMapCenter: moved to starting position`);
	// 	await delay(3 * 1000);
	// 	logger.info(`moveMapCenter: starting mouse drag`);
	// }

	// FIXME: This doesn't work all the time. Not sure why. There is at least 1 understood failure mode which should be handled above.
	await page.mouse.down();
	await delay(1 * 1000); // FIXME: Not sure if this helps, but sometimes the map doesn't move...
	await page.mouse.move(moveToX, moveToY, {steps: 2});
	await delay(500); // FIXME: required?
	await page.mouse.up();

	// Wait for the map to update itself
	return waitForSearchToUpdate(page);
};

const getVisibleListingsOuter = async (page: Page): Promise<ElementHandle<Element> | undefined | null> => {
	// If there are no listings, a second h3 will appear. If there are too few listings, then another will
	// appear showing listings just outside the search area.
	const h3s = await page.$$(PLACES_TO_STAY_SELECTOR);
	if(h3s.length === 0) throw new Error(`No h3s?`);

	const textArray = await Promise.all(
		Array.from(h3s).map((h3) => {
			return h3.evaluate((node) => node.textContent);
		}),
	);

	// NOTE: This relies on the order of the elements. We assume, reasonably, that the
	//       places to stay list will come before the more places to stay nearby list.
	const index = textArray.findIndex((textContent) => {
		if(!textContent) return false;

		// Try to find "117 places to stay" but not "More places to stay"
		return textContent.search(/^((?!more).)*\s+places\s+to\s+stay/i) >= 0;
	});
	if(index < 0) return Promise.resolve(undefined);

	const outerElePromise = h3s[index].evaluateHandle((node) => {
		return node.closest("div[itemprop=itemList] > div");
	});

	return outerElePromise as Promise<ElementHandle<Element> | null>;
};

const getVisibleListings = async (page: Page, findOuter: boolean): Promise<string[]> => {
	let outer: ElementHandle<Element> | null | undefined;

	if(findOuter) {
		outer = await getVisibleListingsOuter(page);
		if(!outer || !outer.asElement()) {
			// It is possible that there is only 1 h3 with "No home results". Let's assume this is the case
			// and just indicate that there are 0 listings.
			logger.warn(`WARN: unable to find outer listing container: ${outer}`);
			return Promise.resolve([]);
		}
	}

	const listItems = await (outer == null ? page : outer).$$("div[itemprop=itemListElement]");
	if(listItems.length === 0) throw new Error(`Outer container has no list items? ${listItems.length}`);

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

		logger.error(`room listing is null? ${room}`);
		return false;
	}) as string[];

	const roomIds = roomUrls.map((roomUrl) => {
		return getRoomIdForThisPage(page, roomUrl);
	}) ;

	return Promise.resolve(roomIds);
};

const getMultiPageListings = async (page: Page, numListings: number): Promise<string[]> => {
	let first: boolean = true;
	let more: boolean;
	let listings: string[] = [];

	do {
		listings = listings.concat(await getVisibleListings(page, first));
		first = false;

		if(DEBUG_SEARCH) logger.info("getMultiPageListings: advancing page");

		more = await advanceToNextListingPage(page);
		if(more) await waitForPagedListingsToUpdate(page);

		if(DEBUG_SEARCH) logger.info(`getMultiPageListings: done advancing page. more is ${more}`);

		await fuzzyDelay(1 * 1000);
	} while(more);

	if(DEBUG_SEARCH) logger.info("getMultiPageListings: returning to page 1");

	await advanceToListingPage1(page);
	await waitForPagedListingsToUpdate(page);

	if(DEBUG_SEARCH) logger.info("getMultiPageListings: done returning to page 1");

	await fuzzyDelay(1 * 1000);

	return Promise.resolve(listings);
};

const getListingPaginator = async (page: Page): Promise<ElementHandle<Element> | undefined> => {
	// There are 2 banks of navs on a page. Top nav bar and the listing page nav bar
	const navs = await page.$$("nav > span ul");
	if(navs.length !== 1) logger.warn(`WARN: Unable to find the paginator nav bar: ${navs.length}`);

	return Promise.resolve(navs[0]);
};

const advanceToNextListingPage = async (page: Page): Promise<boolean> => {
	// Paginator may not exist for perfectly valid reasons, so let's just assume it's valid
	// for it not to exist. Report back that there are no more pages.
	const paginator = await getListingPaginator(page);
	if(!paginator) return Promise.resolve(false);

	// Find the next arrow in the paginator options:
	// When there is only 1 page, there is no paginator.
	// When there are a few (and we are on the 1st page) we have 1, 2, >
	// When there are lots (and we are on the 1st page) we have 1, 2, 3, ..., last (e.g. 13), >
	// When there are lots (and we are not on 1st or last page) we have <, 1, 2, 3, ..., last (e.g. 13), >
	// When there are lots (and we are on the last page) we have <, 1, 2, 3, ..., last (e.g. 13)
	const arrowLis = await paginator.$$(`li:not([data-id]) svg[aria-label=Next]`);
	if(arrowLis.length > 1) throw new Error(`Found too many next arrows? ${arrowLis.length}`);

	if(arrowLis.length === 0) return Promise.resolve(false);

	// FIXME: Sometimes we seem to end up clicking on the wrong thing and this opens a new page with a listing
	const tag = await arrowLis[0].evaluate((node) => {
		return node.tagName!.toLowerCase();
	});

	if(tag !== "svg") {
		throw new Error(`Hmm. Seem to have a ${tag}!`);
	}

	// await arrowLis[0].click();
	await arrowLis[0].evaluate((node) => {
		const closest = node.closest("a");
		closest!.click();
	});

	return Promise.resolve(true);
};

const advanceToListingPage1 = async (page: Page): Promise<void> => {
	const paginator = await getListingPaginator(page);

	// If paginator is not present, then we're probably on page 1. Let's not consider it an error.
	if(!paginator) return Promise.resolve();

	const page1 = await paginator.$$(`li[data-id="page-1"]`);
	if(page1.length !== 1) throw new Error(`Unable to find page 1 paginator: ${page1.length}`);

	return page1[0].click();
};

const getNumberOfListings = async (page: Page): Promise<number> => {
	// If there are no listings, a second h3 will appear. If there are too few listings, then another will
	// appear showing listings just outside the search area.
	const ele = await getVisibleListingsOuter(page);
	if(!ele || !ele.asElement()) {
		// It is possible that there is only 1 h3 with "No home results". Let's assume this is the case
		// and just indicate that there are 0 listings.
		logger.warn(`WARN: unable to find outer listing container: ${ele}`);
		return Promise.resolve(0);
	}

	const text = await ele.evaluate((node) => {
		const h3 = node.querySelector("h3");
		if(!h3) return undefined;

		return h3.textContent;
	});
	if(!text) throw new Error(`unable to find outer listing container's text?: "${text}"`);

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
	if(divs.length !== 1) throw new Error(`Unable to get 1 map div: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getMapDimensions = async (page: Page): Promise<IMapDimensions> => {
	const mapDiv = await getGoogleMap(page);

	const bbox = await mapDiv.boundingBox();
	if(!bbox) throw new Error(`Unable to get map bounding box`);

	return Promise.resolve(bbox);
};

const getMapZoomIn = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const buttonEles = await map.$$(`button[aria-label='Zoom in']`);
	if(buttonEles.length !== 1) throw new Error(`Unable to find 1 zoom in button: ${buttonEles.length}`);

	return Promise.resolve(buttonEles[0]);
};

const getMapZoomOut = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const buttonEles = await map.$$(`button[aria-label='Zoom out']`);
	if(buttonEles.length !== 1) throw new Error(`Unable to find 1 zoom out button: ${buttonEles.length}`);

	return Promise.resolve(buttonEles[0]);
};

const getMapSearchAsMapIsMoved = async (map: ElementHandle<Element>): Promise<ElementHandle<HTMLButtonElement>> => {
	const labelEles = await map.$$(MAP_LABEL_SUB_SELECTOR);
	if(labelEles.length !== 1) throw new Error(`Unable to find 1 zoom out button: ${labelEles.length}`);

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
	}

	return waitForSearchToUpdate(page);
};

// When something changes on the map, everything needs to be updated. This may take a while,
// so wait for both the map to indicate that it's no longer searching and the listings on the page
// have stabilized.
const waitForSearchMapToUpdate = async (page: Page): Promise<any> => {
	// Wait for "Search as I move the map" to disappear.
	// This can occasionally time out, which would seem to indicate a race condition, so just allow
	// the timeout.
	try {
		await page.waitForFunction((mapSel, mapLabelSubSel) => {
				const spanEles = document.querySelectorAll(`${mapSel} ${mapLabelSubSel} > div > span`);
				if(spanEles.length !== 1) return null;

				// Search as I move the map rather than ... to indicate updating.
				return spanEles[0].textContent!.search("Search as I") === -1;
			},
			{timeout: 30 * 1000},
			MAP_SELECTOR,
			MAP_LABEL_SUB_SELECTOR,
		);
	} catch(err) {
		// FIXME: There is a race condition in the code. Let it keep going.
		logger.error(`waitForSearchMapToUpdate: wait for map search text to change failed. Hopefully timeout: ${err}`);
	}

	// Wait for "Search as I move the map" to reappear
	return page.waitForFunction((mapSel, mapLabelSubSel) => {
			const spanEles = document.querySelectorAll(`${mapSel} ${mapLabelSubSel} > div > span`);
			if(spanEles.length !== 1) return null;

			// Search as I move the map rather than ... to indicate updating.
			return spanEles[0].textContent!.search("Search as I") >= 0;
		},
		{polling: "mutation"},
		MAP_SELECTOR,
		MAP_LABEL_SUB_SELECTOR,
	);
};

const waitForPagedListingsToUpdate = async (page: Page): Promise<any> => {
	// Wait for "Search as I move the map" to disappear and reappear.
	return waitForSearchMapToUpdate(page);
};

const waitForSearchToUpdate = async (page: Page): Promise<any> => {
	// Wait for "Search as I move the map" to disappear and reappear.
	await waitForSearchMapToUpdate(page);

	// Assume that by the time this selector is being tested for, that it will have at least
	// disappeared for this is testing for its reappearance.
	return page.waitForSelector(`${PLACES_TO_STAY_SELECTOR}`, {visible: true});
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
