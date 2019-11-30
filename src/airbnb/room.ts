// Scrape a room listing using puppeteer.
// To make things difficult, airbnb likely to do A/B testing and have different formats in different cities.
import { ElementHandle, Page } from "puppeteer";

import { ILocation } from "../types";

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
	// This one has a delay in it, so let it go first to give the page some
	// extra time to stabilize in case that causes errors elsewhere.
	const price = await getRoomPrice(page);

	const id = await getRoomIdForThisPage(page);
	const url = getUrlWithoutQuery(page);
	const title = await getListingTitle(page);
	const type = await getRoomType(page);

	const hostAndCoHostUris = await getHostUri(page);
	const hostUri = hostAndCoHostUris[0];
	const hostId = getHostId(page, hostUri);

	const coHostUris = hostAndCoHostUris.slice(1);
	const coHostIds = coHostUris.map((uri) => {
		return getHostId(page, uri);
	});

	const numReviews = await getNumberOfReviews(page);

	const location = await getLocation(page);

	const guests = await getRoomNumGuestsFromTabbedPage(page);
	const bedrooms = await getRoomNumBedroomsFromTabbedPage(page);
	const beds = await getRoomNumBedsFromTabbedPage(page);
	const bathrooms = await getRoomNumBathroomsFromTabbedPage(page);

	return Promise.resolve({
		id: id,
		url: url,
		title: title,
		type: type,
		hostUri: hostUri,
		hostId: hostId,
		coHostUris: coHostUris,
		coHostIds: coHostIds,
		numReviews: numReviews,
		latitude: location.lat,
		longitude: location.long,
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

const getUrlWithoutQuery = (page: Page): string => {
	const url = page.url();

	// Take off any query parameters.
	return url.split("?")[0];
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

const getHostOuterFromUntabbedPage = async (page: Page): Promise<ElementHandle<Element>> => {
	const divs = await page.$$("#summary");
	if(divs.length !== 1) throw new Error(`unable to find 1 #summary block: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getHostUri = async (page: Page): Promise<AirbnbHostId[]> => {
	let div;
	if(await pageHasTabs(page)) {
		div = await getHostOuterFromTabbedPage(page);
	} else {
		div = await getHostOuterFromUntabbedPage(page);
	}

	// More than 1 host link can show up. For instance, airbnb allows the concept of co-hosts. In this situation,
	// there are multiple host links: 1 for the combined version and 1 for each of the co-hosts. The first listed
	// will be the host (I think this will reasonably hold true) and the additional ones will be co-hosts. See
	// for example (https://www.airbnb.ca/rooms/19720952).
	const hostAndCoHosts = await div.evaluate((node) => {
		const links = Array.from(node.querySelectorAll("a[href*='/users/show/']"));
		if(links.length === 0) return [];

		return links.map((link) => {
			return (link as HTMLLinkElement).href;
		});
	});

	if(hostAndCoHosts.length === 0) throw new Error(`Unable to find hosts/co hosts`);

	return Promise.resolve(hostAndCoHosts);
};

const getListingTitle = async (page: Page): Promise<string> => {
	const listingHeaders = await page.$$("h1");
	if(listingHeaders.length !== 1) throw new Error(`list header should show up 1 time: ${listingHeaders.length}`);

	return listingHeaders[0].evaluate((header) => (header as HTMLElement).innerText);
};

const getRoomPrice = async (page: Page): Promise<number> => {
	// There are 2 types of price boxes that can be presented. They can be mixed and matched
	// so we need to detect the type as well as confirm that it is actually present as its content
	// can load late.
	const selectorA = "main div[data-test-id=book-it-default]";
	const selectorB = "form#book_it_form";
	let cleanedPrice: string;
	let priceStr: string | null | undefined;

	// NOTE: This isn't always visible but should be there. It loads late so wait for a short time just in case.
	const timeout = 2 * 1000; // 2 secs.
	const promiseA = new Promise((resolveA, rejectA) => {
		try {
			page.waitForSelector(selectorA, {timeout: timeout})
				.then((result) => resolveA(result))
				.catch((err) => rejectA(err));
		} catch(err) {
			// Assume timeout
			rejectA(err);
		}
	});

	const promiseB = new Promise((resolveB, rejectB) => {
		try {
			page.waitForSelector(selectorB, {timeout: timeout})
				.then((result) => resolveB(result))
				.catch((err) => rejectB(err));
		} catch(err) {
			// Assume timeout
			rejectB(err);
		}
	});

	// FIXME: Should be first... use race? One of these will always timeout slowing down everything
	//        to a significant degree.
	const promiseResults = await (Promise as any).allSettled([promiseA, promiseB]);
	if(promiseResults[0].status === "fulfilled") {
		// It's here, load it. Note that 1 or 2 of these elements can be visible. They should both contain similar
		// textual information but 1 will be hidden at any given time. Just use the content of the first.
		const divs = await page.$$(selectorA);
		if(divs.length > 2 || divs.length === 0) throw new Error(`(A) price div should show up 1 or 2 times: ${divs.length}`);

		priceStr = await divs[0].evaluate((div) => (div as HTMLElement).textContent);
		if(!priceStr) throw new Error(`(A) priceStr is falsy: ${priceStr}`);

		// FIXME: dollar sign currency only with decimal point.
		cleanedPrice = priceStr.replace(/[$,]*/g, "");
	} else if(promiseResults[1].status === "fulfilled") {
		const divs = await page.$$(selectorB);
		if(divs.length !== 1) throw new Error(`(B) price div should show up 1 time: ${divs.length}`);

		priceStr = await divs[0].evaluate((node) => {
			const priceDivs = node.parentElement;
			return priceDivs ? priceDivs.textContent : priceDivs;
		});
		if(!priceStr) throw new Error(`(B) priceStr is falsy: ${priceStr}`);

		// FIXME: dollar sign currency only with decimal point.
		cleanedPrice = priceStr.replace(/[$,]*/g, "").replace(/^\s*Price:/, "");
	} else {
		throw new Error(`Neither approach found pricing information: ${JSON.stringify(promiseResults)}`);
	}

	const match = cleanedPrice.match(/^([0-9]+)\s*per\s*night/);
	if(!match) throw new Error(`Unable to parse price string: "${priceStr}" and "${cleanedPrice}"`);

	return Promise.resolve(Number(match[1]));
};

const getOverviewOuterFromPageWithTabs = async (page: Page): Promise<ElementHandle<Element>> => {
	const divs = await page.$$("div[data-plugin-in-point-id=OVERVIEW_DEFAULT]");
	if(divs.length !== 1) throw new Error(`unexpected number of overview outer divs: ${divs.length}`);

	return Promise.resolve(divs[0]);
};

const getOverviewOuterTextFromPageWithoutTabs = async (page: Page): Promise<string> => {
	const summaryDiv = await page.$("#summary");
	if(!summaryDiv) throw new Error(`summary div not found: ${summaryDiv}`);

	const text = await summaryDiv.evaluate((node) => {
		const parent = node.parentElement;
		if(!parent) return null;

		const overviewDiv = parent.querySelector(":scope > :nth-child(3)");
		if(!overviewDiv) return null;

		return (overviewDiv as HTMLElement).innerText;
	});
	if(!text) throw new Error(`unable to find the innerText of the 3rd child/overview div: ${text}`);

	return Promise.resolve(text);
};

const getRoomType = async (page: Page): Promise<AirbnbRoomType> => {
	let type: AirbnbRoomType;
	let text: string;

	if(await pageHasTabs(page)) {
		const outer = await getOverviewOuterFromPageWithTabs(page);
		text = await outer.evaluate((div) => (div as HTMLElement).innerText);
	} else {
		text = await getOverviewOuterTextFromPageWithoutTabs(page);
	}

	// Unfortunately, not all configurations of pages give us a nice easy "This is what this room is" indication!
	// There will be lots of text here, so all we can do is search for what we're looking for within.
	// text will be something like:
	//
	// (tabbed)
	// "Entire guesthouse hosted by Amy
	// 3 guests · 1 bedroom · 1 bed · 1 bath"
	//
	// or
	//
	// (untabbed)
	//
	// "3 guests
	// 1 bedroom
	// 1 bed
	// 1 bath
	// 󱀁
	// Entire home
	// You’ll have the guesthouse to yourself.
	// 󰀢
	// Sparkling clean
	// 17 recent guests said this place was sparkling clean.
	// 󰀃
	// Amy is a Superhost
	// Superhosts are experienced, highly rated hosts who are committed to providing great stays for guests.
	// 󰀐
	// Great location
	// 90% of recent guests gave the location a 5-star rating."

	if(text.search(AirbnbRoomType.PRIVATE_ROOM) >= 0) {
		type = AirbnbRoomType.PRIVATE_ROOM;

	} else if(text.search(AirbnbRoomType.SHARED_ROOM) >= 0) {
		type = AirbnbRoomType.SHARED_ROOM;

	} else if(text.search(AirbnbRoomType.ROOM_IN_HOUSE) >= 0) {
		type = AirbnbRoomType.ROOM_IN_HOUSE;

	} else if(text.search(AirbnbRoomType.FARM_STAY) >= 0) {
		type = AirbnbRoomType.FARM_STAY;

	} else if(text.search(AirbnbRoomType.CAVE_STAY) >= 0) {
		type = AirbnbRoomType.CAVE_STAY;

	} else if(text.search(AirbnbRoomType.ENTIRE_LOFT) >= 0) {
		type = AirbnbRoomType.ENTIRE_LOFT;

	} else if(text.search(AirbnbRoomType.ENTIRE_HOME) >= 0) {
		type = AirbnbRoomType.ENTIRE_HOME;

	} else if(text.search(AirbnbRoomType.ENTIRE_HOUSE) >= 0) {
		type = AirbnbRoomType.ENTIRE_HOUSE;

	} else if(text.search(AirbnbRoomType.ENTIRE_BUNGALOW) >= 0) {
		type = AirbnbRoomType.ENTIRE_BUNGALOW;

	} else if(text.search(AirbnbRoomType.ENTIRE_TOWNHOUSE) >= 0) {
		type = AirbnbRoomType.ENTIRE_TOWNHOUSE;

	} else if(text.search(AirbnbRoomType.ENTIRE_CONDOMINIUM) >= 0) {
		type = AirbnbRoomType.ENTIRE_CONDOMINIUM;

	} else if(text.search(AirbnbRoomType.ENTIRE_APARTMENT) >= 0) {
		type = AirbnbRoomType.ENTIRE_APARTMENT;

	} else if(text.search(AirbnbRoomType.ENTIRE_SERVICED_APARTMENT) >= 0) {
		type = AirbnbRoomType.ENTIRE_SERVICED_APARTMENT;

	} else if(text.search(AirbnbRoomType.ENTIRE_CABIN) >= 0) {
		type = AirbnbRoomType.ENTIRE_CABIN;

	} else if(text.search(AirbnbRoomType.ENTIRE_COTTAGE) >= 0) {
		type = AirbnbRoomType.ENTIRE_COTTAGE;

	} else if(text.search(AirbnbRoomType.ENTIRE_GUEST_HOUSE) >= 0) {
		type = AirbnbRoomType.ENTIRE_GUEST_HOUSE;

	} else if(text.search(AirbnbRoomType.ENTIRE_GUEST_SUITE) >= 0) {
		type = AirbnbRoomType.ENTIRE_GUEST_SUITE;

	} else if(text.search(AirbnbRoomType.ROOM_IN_HOTEL) >= 0) {
		type = AirbnbRoomType.ROOM_IN_HOTEL;

	} else {
		throw new Error(`Unknown type of room: ${text}`);
	}

	return Promise.resolve(type);
};

const getRoomStatsFromTabbedPage = async (page: Page): Promise<IAirbnbRoomStats> => {
	let text: string | undefined;

	if(await pageHasTabs(page)) {
		const outer = await getOverviewOuterFromPageWithTabs(page);
		text = await outer.evaluate((div) => {
			const spans = Array.from(div.querySelectorAll("span"));

			return spans.reduce((prevValue, span) => {
				return prevValue + span.innerText + "\n";
			}, "");
		});

	} else {
		text = await getOverviewOuterTextFromPageWithoutTabs(page);
	}

	if(!text) throw new Error(`no text for room stats: ${text}`);

	const textInLines  = text.split(/\n/);
	const roomStats = textInLines.reduce((prevValue, line) => {
		if(line.search(/guests?$/) >= 0) { // Could be guest or guests but be careful not to match guesthouse or review text
			const guests = line.match(/^\s*([0-9]*)[^0-9]*$/);
			if(guests) prevValue.guests = Number(guests[1]);
		} else if(line.search("bedroom") >= 0) { // Could be bedroom or bedrooms or Studio. Studio is caught below.
			const bedrooms = line.match(/^\s*([0-9]*)[^0-9]*$/);
			if(bedrooms) prevValue.bedrooms = Number(bedrooms[1]);
		} else if(line.search("bed") >= 0) { // Could be bed or beds
			const beds = line.match(/^\s*([0-9]*)[^0-9]*$/);
			if(beds) prevValue.beds = Number(beds[1]);
		} else if(line.search("bath") >= 0) { // Could be 1 or 1.5 or 2 etc.
			const bathrooms = line.match(/^\s*([0-9.]*)[^0-9.]*$/);
			if(bathrooms) prevValue.bathrooms = Number(bathrooms[1]);
		} else if(line.toLowerCase().search("studio") >= 0) {
			prevValue.bedrooms = 0; // It's something to signify there is no separate bedroom.
		}

		return prevValue;
	}, {
		guests: -1,
		bedrooms: -1,
		beds: -1,
		bathrooms: -1,
	});

	// NOTE:  There are some circumstances (https://www.airbnb.ca/rooms/9809087 for instance) where not all
	//        fields are provided. These fields are presumably optional but I don't know which ones.
	//        We will default to -1 and only consider it a failure when none of the fields can be found.
	if(roomStats.guests < 0 && roomStats.bedrooms < 0 && roomStats.beds < 0 && roomStats.bathrooms < 0) {
		throw new Error(`unable to find all the room stats ${JSON.stringify(roomStats)}`);
	}

	return Promise.resolve(roomStats);

	// const outer = await getOverviewOuterFromPageWithTabs(page);

	// // We should now have at least 4 spans (# guests, #bedrooms, #beds, and #bathrooms)
	// const possibleSpans = await outer.$$("span");
	// if(possibleSpans.length < 4) throw new Error(`Too few overview spans found: ${possibleSpans.length}`);

	// const roomStats: IAirbnbRoomStats = {
	// 	guests: -1,
	// 	bedrooms: -1,
	// 	beds: -1,
	// 	bathrooms: -1,
	// };

	// const resultPromises = possibleSpans.map(async (div: ElementHandle<Element>) => {
	// 	const result: IAirbnbRoomStats | any = {};

	// 	const text = await div.evaluate((aDiv) => (aDiv as HTMLElement).innerText);

	// 	if(text.search("guest") >= 0) { // Could be guest or guests
	// 		const guests = text.match(/^\s*([0-9]*)[^0-9]*$/);
	// 		if(guests) result.guests = Number(guests[1]);
	// 	} else if(text.search("bedroom") >= 0) { // Could be bedroom or bedrooms
	// 		const bedrooms = text.match(/^\s*([0-9]*)[^0-9]*$/);
	// 		if(bedrooms) result.bedrooms = Number(bedrooms[1]);
	// 	} else if(text.search("bed") >= 0) { // Could be bed or beds
	// 		const beds = text.match(/^\s*([0-9]*)[^0-9]*$/);
	// 		if(beds) result.beds = Number(beds[1]);
	// 	} else if(text.search("bath") >= 0) { // Could be 1 or 1.5 or 2 etc.
	// 		const bathrooms = text.match(/^\s*([0-9.]*)[^0-9.]*$/);
	// 		if(bathrooms) result.bathrooms = Number(bathrooms[1]);
	// 	}

	// 	return Promise.resolve(result);
	// });

	// // Wait for all the results and then merge them
	// const results = await Promise.all(resultPromises);
	// Object.assign(roomStats, ...results);

	// if(roomStats.guests < 0 || roomStats.bedrooms < 0 || roomStats.beds < 0 || roomStats.bathrooms < 0) {
	// 	throw new Error(`unable to find all the room stats ${JSON.stringify(roomStats)}`);
	// }

	// return Promise.resolve(roomStats);
};

const getRoomNumGuestsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.guests); };
const getRoomNumBedroomsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.bedrooms); };
const getRoomNumBedsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.beds); };
const getRoomNumBathroomsFromTabbedPage = async (page: Page): Promise<number> => { const stats = await getRoomStatsFromTabbedPage(page); return Promise.resolve(stats.bathrooms); };

const getNumberOfReviews = async (page: Page): Promise<number> => {
	if(await pageHasTabs(page)) {
		// find tabs
		const tabsOuter = await page.$$("div[data-plugin-in-point-id=NAV_DEFAULT]");
		if(tabsOuter.length !== 1) throw new Error(`unable to find outer nav tab in tabbed mode: ${tabsOuter.length}`);

		const text = await tabsOuter[0].evaluate((node) => {
			return node.textContent;
		});
		if(!text) throw new Error(`Unable to find nav tabs text: ${text}`);

		// Get number of reviews from the tab. Will look something like: "OverviewPhotos(9)Reviews(8)" but may
		// also look like: "OverviewPhotos(17)Reviews(43)Location".
		// If there are no reviews, then it will look like "OverviewPhotos(17)". In this case we double check
		// that the REVIEWS_EMPTY_DEFAULT selector is there.
		const match = text.match(/^.*Reviews\(([0-9]+)\)(Location)?/);
		if(!match) {
			const emptyReviews = await page.$$("div[data-plugin-in-point-id=REVIEWS_EMPTY_DEFAULT]");
			if(emptyReviews.length !== 1) throw new Error(`Unable to find matching Review pattern (tabbed) and empty review section: ${text}`);

			return Promise.resolve(0);
		}

		return Promise.resolve(Number(match[1]));
	} else {
		// There are a few formats to the review section. The ones I've seen look like this:
		// 1) Reviews\n *4.75 | 5 reviews\n ...
		// 2) 1 Review\n ...
		// 3) 5 Reviews
		// 4) No reviews (yet) -> NOTE: Has no div[data-heading-focus*='review']
		const reviews = await page.$$("#reviews");
		if(reviews.length !== 1) throw new Error(`Unable to find #reviews (non tabbed): ${reviews.length}`);

		const divs = await reviews[0].$$("div[data-heading-focus*='review']");
		if(divs.length > 1) throw new Error(`Unable to find 1 div for reviews (non tabbed): ${divs.length}`);

		if(divs.length === 0) {
			// We should have no reviews. Something like: "No reviews (yet)Be one of the first guests to review Sheryl’s ..."
			const noReviewText = await reviews[0].evaluate((node) => {
				return node.textContent;
			});
			if(!noReviewText) throw new Error(`Unable to find text content for review area: ${noReviewText}`);

			if(noReviewText.search(/^No\s+reviews\s+\(yet\)/) === -1) throw new Error(`Unable to find no reviews yet: ${noReviewText}`);

			return Promise.resolve(0);
		} else {
			// We should have reviews.
			const reviewText = await divs[0].evaluate((node) => {
				return node.textContent;
			});
			if(!reviewText) throw new Error(`Unable to find text content for review header: ${reviewText}`);

			// Will be something like: "1 Review"
			const match = reviewText.match(/([0-9]+)\s+[Rr]eviews?$/);
			if(!match) throw new Error(`Unable to find matching Review pattern (untabbed): ${reviewText}`);

			return Promise.resolve(Number(match[1]));
		}
	}
};

const getLocation = async (page: Page): Promise<ILocation> => {
	// Find the coords straight off the map.
	const mapLink = await page.$$("div[data-veloute='map/GoogleMap'] a[href*='https://www.google.com/maps/']") as Array<ElementHandle<HTMLLinkElement>>;
	if(mapLink.length !== 1) throw new Error(`Unable to find 1 google map link with location: ${mapLink.length}`);

	const linkText = await mapLink[0].evaluate((node) => {
		return node.href;
	});
	if(!linkText) throw new Error(`Unable to get access to the href for the google map with location: ${linkText}`);

	const match = linkText.match(/\/@([0-9\.-]+),([0-9\.-]+),([0-9\.-]+z?)/);
	if(!match) throw new Error(`Unable to match location ${linkText[0]}`);

	return Promise.resolve({
		lat: Number(match[1]),
		long: Number(match[2]),
	});
};
