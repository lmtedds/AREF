// Scrape a room listing using puppeteer.
// To make things difficult, airbnb likely to do A/B testing and have different formats in different cities.
import { ElementHandle, Page } from "puppeteer";

import { getHostId } from "./host";
import { AirbnbHostId, AirbnbRoomId, AirbnbRoomType, IAirbnbListing, IAirbnbRoomStats } from "./types";

/*

TODO list of items on the page. Asterix at start indicates complete.

*URL: baseUrl/rooms/:room-id

*Listing title
City
Host Picture
Host Namepage
*Host Link (Host Id)
*Number of guests
*Number of bedrooms
*Number of beds
*Number of bathrooms
*Property Type (private room in house, Entire home (can also be used for self contained suite), etc?)
Verbose description of what property type means including:
Number of guests
Number of bedrooms
Number of beds
Number of bath
Ammenities

*Price

Type of checkin (self check-in, etc?)

Cleanliness experience description

Checkin experience description

Free form description

Link to contact host

Amenities Title
(list of amenities partially hidden behind a show all link)

Sleeping arrangements
(picture and list of num beds)

Availability (date picker)
AirbnbRoomType
Reviews Title

star rating
number of reviews

rating dashboard

search reviews bar
review list
review page tab

Hosted by Title
Host location
Host Joined Date
Number of reviews
Verified Indication

Message From Host
Interations with Host

Information about the neighbourhood

Google Map
*/

export const parseRoomListing = async (page: Page): Promise<IAirbnbListing> => {
	const hasTabs = await pageHasTabs(page);
	if(!hasTabs) {
		console.error(`Listing page doesn't have tabs ... probably won't work.`);

		const id = await getRoomIdForThisPage(page);
		const title = await getListingTitle(page);
		const type = await getRoomTypeFromUntabbedPage(page);
		const hostUri = await getHostUri(page);
		const hostId = await getHostId(page, hostUri);
		const price = await getRoomPrice(page);
		const guests = await getRoomNumGuestsFromTabbedPage(page);
		const bedrooms = await getRoomNumBedroomsFromTabbedPage(page);
		const beds = await getRoomNumBedsFromTabbedPage(page);
		const bathrooms = await getRoomNumBathroomsFromTabbedPage(page);

		return Promise.resolve({
			id: id,
			title: title,
			type: type,
			hostUri: hostUri,
			hostId: hostId,
			price: price,
			guests: guests,
			bedrooms: bedrooms,
			beds: beds,
			bathrooms: bathrooms,
		});
	} else {
		const id = await getRoomIdForThisPage(page);
		const title = await getListingTitle(page);
		const type = await getRoomTypeFromTabbedPage(page);
		const hostUri = await getHostUri(page);
		const hostId = await getHostId(page, hostUri);
		const price = await getRoomPrice(page);
		const guests = await getRoomNumGuestsFromTabbedPage(page);
		const bedrooms = await getRoomNumBedroomsFromTabbedPage(page);
		const beds = await getRoomNumBedsFromTabbedPage(page);
		const bathrooms = await getRoomNumBathroomsFromTabbedPage(page);

		return Promise.resolve({
			id: id,
			title: title,
			type: type,
			hostUri: hostUri,
			hostId: hostId,
			price: price,
			guests: guests,
			bedrooms: bedrooms,
			beds: beds,
			bathrooms: bathrooms,
		});
	}
};

// Extract host ID from something like https://www.airbnb.ca/rooms/17300762
export const getRoomIdForThisPage = (page: Page, url?: string): AirbnbRoomId => {
	const href = url ? url : page.url();
	const segments = href.split("/");
	const idSegment = segments[segments.length - 1];

	// Take off any query parameters.
	return idSegment.split("?")[0];
};

const pageHasTabs = async (page: Page): Promise<boolean> => {
	const divs = await page.$$("div[data-plugin-in-point-id=NAV_DEFAULT]");
	if(divs.length > 1) throw new Error(`unexpected number of nav outer divs: ${divs.length}`);

	return Promise.resolve(!!divs.length);
};

const getHostOuterFromTabbedPage = async (page: Page): Promise<ElementHandle<Element>> => {
	const divs = await page.$$("div[data-plugin-in-point-id=HOST_PROFILE_DEFAULT]");
	if(divs.length !== 1) throw new Error(`unexpected number of host outer divs: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getHostUri = async (page: Page): Promise<AirbnbHostId> => {
	const div = await getHostOuterFromTabbedPage(page);

	const as = await div.$$("a[href*='/users/show/']");
	if(as.length !== 1) throw new Error(`host link should show up 1 time: ${as.length}`);

	return as[0].evaluate((a) => (a as HTMLLinkElement).href);
};

const getListingTitle = async (page: Page): Promise<string> => {
	const listingHeaders = await page.$$("h1");
	if(listingHeaders.length !== 1) throw new Error(`list header should show up 1 time: ${listingHeaders.length}`);

	return listingHeaders[0].evaluate((header) => (header as HTMLElement).innerText);
};

const getRoomPrice = async (page: Page): Promise<number> => {
	const selector = "main div[data-test-id=book-it-default]";

	// NOTE: This isn't always visible but should be there. It loads late so wait up to 30 seconds for it.
	await page.waitForSelector(selector, {timeout: 30 * 1000});

	// It's here, load it. Note that 1 or 2 of these elements can be visible. They should both contain similar
	// textual information so work off that.
	const divs = await page.$$(selector);
	if(divs.length > 2 || divs.length === 0) throw new Error(`price span should show up 1 or 2 time: ${divs.length}`);

	const priceStr = await divs[0].evaluate((div) => (div as HTMLElement).innerText);

	// FIXME: dollar sign currency only with decimal point.
	const cleanedPrice = priceStr.replace(/[$,]*/g, "");
	const match = cleanedPrice.match(/^([0-9]+)\sper\snight/);
	if(!match) throw new Error(`Unable to parse price string: "${priceStr}" and "${cleanedPrice}"`);

	return Promise.resolve(Number(match[0]));
};

const getOverviewOuterFromTabbedPage = async (page: Page): Promise<ElementHandle<Element>> => {
	const divs = await page.$$("div[data-reactroot] > div[data-plugin-in-point-id=OVERVIEW_DEFAULT]");
	if(divs.length !== 1) throw new Error(`unexpected number of overview outer divs: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getRoomTypeFromUntabbedPage = async (page: Page): Promise<AirbnbRoomType> => {
	const divTexts = await page.evaluate(() => {
		const divs = Array.from(document.querySelectorAll("div[data-reactroot]"));
		return divs.map((div) => {
			return (div as HTMLElement).innerText;
		});
	});
	if(divTexts.length < 1) throw new Error(`unexpected number of overview outer divs: ${divTexts.length}`);

	// The important one will start with a number
	const text = divTexts.filter((str) => {
		return str.search(/^[0-9]/);
	});
	if(!text) throw new Error(`unable to find text block with num guests`);

	throw new Error(`Not fully implemented`);
};

const getRoomTypeFromTabbedPage = async (page: Page): Promise<AirbnbRoomType> => {
	const outer = await getOverviewOuterFromTabbedPage(page);

	const text = await outer.evaluate((div) => (div as HTMLElement).innerText);

	let type;

	// There will be lots of text here, so all we can do is search for what we're looking for within.
	// text will be something like:
	// "Entire guesthouse hosted by Amy
	// 3 guests · 1 bedroom · 1 bed · 1 bath"
	if(text.startsWith(AirbnbRoomType.PRIVATE_ROOM)) {
		type = AirbnbRoomType.PRIVATE_ROOM;

	} else if(text.startsWith(AirbnbRoomType.SHARED_ROOM)) {
		type = AirbnbRoomType.SHARED_ROOM;

	} else if(text.startsWith(AirbnbRoomType.ENTIRE_HOUSE)) {
		type = AirbnbRoomType.ENTIRE_HOUSE;

	} else if(text.startsWith(AirbnbRoomType.ENTIRE_BUNGALOW)) {
		type = AirbnbRoomType.ENTIRE_BUNGALOW;

	} else if(text.startsWith(AirbnbRoomType.ENTIRE_GUEST_HOUSE)) {
		type = AirbnbRoomType.ENTIRE_GUEST_HOUSE;

	} else if(text.startsWith(AirbnbRoomType.ENTIRE_GUEST_SUITE)) {
		type = AirbnbRoomType.ENTIRE_GUEST_SUITE;

	} else {
		throw new Error(`Unknown type of room: ${text}`);
	}

	return Promise.resolve(type);
};

const getRoomStatsFromTabbedPage = async (page: Page): Promise<IAirbnbRoomStats> => {
	const outer = await getOverviewOuterFromTabbedPage(page);

	// We should now have at least 4 spans (# guests, #bedrooms, #beds, and #bathrooms)
	const possibleSpans = await outer.$$("span");
	if(possibleSpans.length < 4) throw new Error(`Too few overview spans found: ${possibleSpans.length}`);

	const roomStats: IAirbnbRoomStats = {
		guests: -1,
		bedrooms: -1,
		beds: -1,
		bathrooms: -1,
	};

	const resultPromises = possibleSpans.map(async (div: ElementHandle<Element>) => {
		const result: IAirbnbRoomStats | any = {};

		const text = await div.evaluate((aDiv) => (aDiv as HTMLElement).innerText);

		if(text.search("guest") >= 0) { // Could be guest or guests
			const guests = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(guests) result.guests = Number(guests[1]);
		} else if(text.search("bedroom") >= 0) { // Could be bedroom or bedrooms
			const bedrooms = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(bedrooms) result.bedrooms = Number(bedrooms[1]);
		} else if(text.search("bed") >= 0) { // Could be bed or beds
			const beds = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(beds) result.beds = Number(beds[1]);
		} else if(text.search("bath") >= 0) { // Could be 1 or 1.5 or 2 etc.
			const bathrooms = text.match(/^\s*([0-9.]*)[^0-9.]*$/);
			if(bathrooms) result.bathrooms = Number(bathrooms[1]);
		}

		return Promise.resolve(result);
	});

	// Wait for all the results and then merge them
	const results = await Promise.all(resultPromises);
	Object.assign(roomStats, ...results);

	if(roomStats.guests < 0 || roomStats.bedrooms < 0 || roomStats.beds < 0 || roomStats.bathrooms < 0) {
		throw new Error(`unable to find all the room stats ${JSON.stringify(roomStats)}`);
	}

	return Promise.resolve(roomStats);
};

const getRoomNumGuestsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.guests); };
const getRoomNumBedroomsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.bedrooms); };
const getRoomNumBedsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.beds); };
const getRoomNumBathroomsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.bathrooms); };
