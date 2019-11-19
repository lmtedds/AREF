// Scrape a room listing using puppeteer.
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

// FIXME: Need to handle console.assert better. Probably turn into a Promise.reject

export const parseRoomListing = async (page: Page): Promise<IAirbnbListing> => {
	const id = await getRoomIdForThisPage(page);
	const title = await getListingTitle(page);
	const type = await getRoomType(page);
	const hostUri = await getHostUri(page);
	const hostId = await getHostId(page, hostUri);
	const price = await getRoomPrice(page);
	const guests = await getRoomNumGuests(page);
	const bedrooms = await getRoomNumBedrooms(page);
	const beds = await getRoomNumBeds(page);
	const bathrooms = await getRoomNumBathrooms(page);

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
};

// Extract host ID from something like https://www.airbnb.ca/rooms/17300762
export const getRoomIdForThisPage = (page: Page, url?: string): AirbnbRoomId => {
	const href = url ? url : page.url();
	const segments = href.split("/");
	const idSegment = segments[segments.length - 1];

	// Take off any query parameters.
	return idSegment.split("?")[0];
};

const getHostUri = async (page: Page): Promise<AirbnbHostId> => {
	const as = await page.$$("div._1ij6gln6 > a[href*='/users/show/']");
	if(as.length !== 1) return Promise.reject(`host link should show up 1 time: ${JSON.stringify(as)}`);

	return as[0].evaluate((a) => (a as HTMLLinkElement).href);
};

const getListingTitle = async (page: Page): Promise<string> => {
	const listingHeaders = await page.$$("h1");
	if(listingHeaders.length !== 1) return Promise.reject(`list header should show up 1 time: ${JSON.stringify(listingHeaders)}`);

	return listingHeaders[0].evaluate((header) => (header as HTMLElement).innerText);
};

const getRoomType = async (page: Page): Promise<AirbnbRoomType> => {
	const divs = await page.$$("div._n5lh69r > div._1p3joamp");
	if(divs.length !== 1) return Promise.reject(`room type div should show up 1 time: ${JSON.stringify(divs)}`);

	const text = await divs[0].evaluate((div) => (div as HTMLElement).innerText);

	let type;

	switch(text) {
		case "Private room in house":
			type = AirbnbRoomType.PRIVATE_ROOM;
			break;

		case "FIXME:":
			type = AirbnbRoomType.SHARED_ROOM;
			break;

		case "Entire home":
			type = AirbnbRoomType.ENTIRE_HOUSE;
			break;

		default:
			type = AirbnbRoomType.ERROR;
			break;
	}

	return Promise.resolve(type);
};

const getRoomPrice = async (page: Page): Promise<number> => {
	// NOTE: This isn't always visible but should be there. It loads late so wait up to 30 seconds for it.
	await page.waitForSelector("span._doc79r", {timeout: 30 * 1000});
	const spans = await page.$$("span._doc79r");
	if(spans.length !== 1) return Promise.reject(`price span should show up 1 time: ${JSON.stringify(spans)}`);

	const priceStr = await spans[0].evaluate((span) => (span as HTMLElement).innerText);

	// FIXME: dollar sign currency only with decimal point.
	const cleanedPrice = priceStr.replace(/[$,]*/g, "");
	if(priceStr === cleanedPrice) return Promise.reject(`prices ${priceStr} and ${cleanedPrice} are not different`);

	return Promise.resolve(Number(cleanedPrice));
};

const getRoomStats = async (page: Page): Promise<IAirbnbRoomStats> => {
	const divs = await page.$$("div[data-reactroot] > div > div._hgs47m");
	if(divs.length !== 1) return Promise.reject(`unexpected number of room information divs: ${divs.length}`);

	const possibleDivs = await divs[0].$$("div");
	const roomStats: IAirbnbRoomStats = {
		guests: -1,
		bedrooms: -1,
		beds: -1,
		bathrooms: -1,
	};

	const resultPromises = possibleDivs.map(async (div: ElementHandle<Element>) => {
		const result: IAirbnbRoomStats | any = {};

		const text = await div.evaluate((aDiv) => (aDiv as HTMLElement).innerText);

		if(text.search("guests") >= 0) {
			const guests = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(guests) result.guests = Number(guests[1]);
		} else if(text.search("bedroom") >= 0) {
			const bedrooms = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(bedrooms) result.bedrooms = Number(bedrooms[1]);
		} else if(text.search("bed") >= 0) {
			const beds = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(beds) result.beds = Number(beds[1]);
		} else if(text.search("bath") >= 0) {
			const bathrooms = text.match(/^\s*([0-9]*)[^0-9]*$/);
			if(bathrooms) result.bathrooms = Number(bathrooms[1]);
		}

		return Promise.resolve(result);
	});

	// Wait for all the results and then merge them
	const results = await Promise.all(resultPromises);
	Object.assign(roomStats, ...results);

	if(roomStats.guests < 0 || roomStats.bedrooms < 0 || roomStats.beds < 0 || roomStats.bathrooms < 0) {
		return Promise.reject(`unable to find all the room stats ${JSON.stringify(roomStats)}`);
	}

	return Promise.resolve(roomStats);
};

const getRoomNumGuests = async (page: Page): Promise<number> => { const stats = await getRoomStats(page); return Promise.resolve(stats.guests); };
const getRoomNumBedrooms = async (page: Page): Promise<number> => { const stats = await getRoomStats(page); return Promise.resolve(stats.bedrooms); };
const getRoomNumBeds = async (page: Page): Promise<number> => { const stats = await getRoomStats(page); return Promise.resolve(stats.beds); };
const getRoomNumBathrooms = async (page: Page): Promise<number> => { const stats = await getRoomStats(page); return Promise.resolve(stats.bathrooms); };
