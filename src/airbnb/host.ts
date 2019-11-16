// Scrape a host's page using puppeteer.
import { ElementHandle, Page } from "puppeteer";

import { AirbnbHostId, AirbnbRoomId, IAirbnbHost, IAirbnbHostNumReviews, IAirbnbHostReviews } from "./types";

/*

TODO:

URL: baseUrl/users/show/:hostid

* Host Name
* Host join date
* Where host lives
* Is Super Host?

Welcome statement
Message to Guests
Where do they live
Languages

* Listings (pictures in side scroll carousel)
View all x listings

Host's Guidebooks

Reviews Tabs
Active Review Tabs' Reviews

*/

export const parseHostListing = async (page: Page): Promise<IAirbnbHost> => {
	const id = getHostId(page);
	const name = await getHostName(page);
	const superHost = await isSuperHost(page);
	const hostListings = await getHostsListings(page);

	const numReviews = await getNumHostReviews(page);
	// const reviews = await getHostReviews(page);

	return Promise.resolve({
		id: id,
		name: name,
		superHost: superHost,
		hostListings: hostListings,

		numReviews: numReviews,
		// reviews: reviews,
	});
};

// Extract host ID from something like https://www.airbnb.ca/users/show/73583248 or
// from the URL of this page.
export const getHostId = (page: Page, url?: string): AirbnbHostId => {
	const href = url ? url : page.url();
	const segments = href.split("/");
	const idSegment = segments[segments.length - 1];

	// Take off any query parameters.
	return idSegment.split("?")[0];
};

const getHostName = async (page: Page): Promise<string> => {
	const salutationDivs = await page.$$("div._1ekkhy94");
	if(salutationDivs.length !== 1) return Promise.reject(`unable to find 1 salutation div: ${JSON.stringify(salutationDivs)}`);

	const salutation: string = await salutationDivs[0].evaluate((div) => (div as HTMLElement).innerText);

	const name = salutation.replace(`Hi, I’m `, ``);

	return Promise.resolve(name);
};

const isSuperHost = async (page: Page): Promise<boolean> => {
	const divs = await page.$$("div._1ekkhy94");
	if(divs.length !== 1) return Promise.reject(`Unable to find isSuperHost divs: ${JSON.stringify(divs)}`);

	const divPromises = divs.map(async (div: ElementHandle<Element>) => {
		return div.evaluate((ele) => (ele as HTMLElement).innerText);
	});

	const theDivs = await Promise.all(divPromises);
	const theDiv = theDivs.find((text: string) => {
		return text === "Superhost";
	});

	return !!theDiv;
};

const getHostLocation = async (page: Page): Promise<string> => {
	const divs = await page.$$("div._910j1c5");
	if(divs.length !== 1) return Promise.reject(`Unable to find getHostLocation divs: ${JSON.stringify(divs)}`);

	const divPromises = divs.map(async (div: ElementHandle<Element>) => {
		return div.evaluate((ele) => (ele as HTMLElement).innerText);
	});

	const theDivs = await Promise.all(divPromises);
	const text = theDivs.find((divText: string) => {
		return divText.startsWith("Lives in ");
	});

	if(!text) return Promise.reject(`Unable to find getHostLocation expected text: ${JSON.stringify(theDivs)}`);

	return Promise.resolve(text.replace("Lives in ", ""));
};

const getHostListingSection = async (page: Page): Promise<ElementHandle<Element>> => {
	// Find the div which has text "${getHostName()}'s listings" then go up to find the section.
	const theHostName = await getHostName(page);

	const result = await page.evaluateHandle((hostName) => {
		const divs = Array.from(document.querySelectorAll("section > h1 > div")) as HTMLElement[];
		console.assert(divs.length > 0, `Unable to find host listing section divs`);

		const theDiv = divs.find((div: HTMLElement) => {
			return div.innerText.startsWith(hostName);
		});
		console.assert(theDiv, `Unable to find host listing section div`);

		// If we have a div, then go up to find the parent section.
		let section: HTMLElement | undefined | null = theDiv;
		while(section) {
			section = section.parentElement;

			if(section && section.tagName === "SECTION") break;
		}

		return section;
	}, theHostName) as ElementHandle<Element>;

	if(!result) return Promise.reject(`Unable to find host listing section`);

	return Promise.resolve(result);
};

const getHostsListings = async (page: Page): Promise<AirbnbRoomId[]> => {
	const listingSection = await getHostListingSection(page);

	if(!listingSection) return Promise.reject(`getHostsListings: Unable to find host listing section`);

	// Get all the link tag's hrefs. Then make them unique by throwing into a Set as there are
	// likely 2 links for the same listing.
	const result = await listingSection.evaluate((node) => {
		return Array.from(node.querySelectorAll("a")).map((aTag) => aTag.href);
	});

	if(result.length === 0) return Promise.reject(`Unable to find any host listings hrefs - there should be at least 1`);

	const hrefSet = new Set(result);

	return Promise.resolve(Array.from(hrefSet.values()));
};

const getHostReviewSection = async (page: Page): Promise<ElementHandle<Element>> => {
	// Find the h1 #review-section-title

	const reviewSection = await page.evaluateHandle(() => {
		// FIXME: This is probably fairly fragile going for an autogenerated class.
		const divs = Array.from(document.querySelectorAll("h1#review-section-title")) as HTMLElement[];
		console.assert(divs.length === 1, `Unable to find review section section header ${divs.length}`);

		// If we have a div, then go up to find the parent section.
		let section: HTMLElement | undefined | null = divs[0];
		while(section) {
			section = section.parentElement;

			if(section && section.tagName === "SECTION") break;
		}

		return section;
	}) as ElementHandle<Element>;

	if(!reviewSection) return Promise.reject(`Unable to find host review section`);

	return Promise.resolve(reviewSection);
};

const getHostReviewTabs = async (page: Page): Promise<Array<ElementHandle<Element>>> => {
	const reviewSection = await getHostReviewSection(page);

	if(!reviewSection) return Promise.reject(`getHostReviewTabs: Unable to find the host review section`);

	const tabListDivs = await reviewSection.$$("div[role=tablist]");
	if(tabListDivs.length !== 1) return Promise.reject(`Unable to find the host review tablist div - is this possible?`);

	// Puppeteer doesn't provide a nice way to return all the handles at once...
	const numChildren = await tabListDivs[0].evaluate((node) => {
		return node.children.length;
	});

	// NOTE: 1 based counter
	const promises: Array<Promise<ElementHandle<Element>>> = [];
	for(let i = 1; i <= numChildren; ++i) {
		promises.push(tabListDivs[0].$(`:nth-child(${i})`) as Promise<ElementHandle<Element>>); // Can't be null
	}

	return Promise.all(promises);
};

const parseHostReviewType = (text: string): "guests" | "hosts" | null => {
	const match = text.match(/^From\s*([^\s]*)\s*\(([0-9]*)\)$/);
	if(!match || match.length !== 3) {
		console.error(`Unable to parse review tab button content: "${text}" ${JSON.stringify(match)}`);
	} else {
		switch(match[1]) {
			case "guests":
			case "hosts":
				return match[1];

			default:
				console.error(`Unexpected review tab title`);
				break;
		}
	}

	return null;
};

const getNumHostReviews = async (page: Page): Promise<IAirbnbHostNumReviews> => {
	const outerTabs: Array<ElementHandle<Element>> = await getHostReviewTabs(page);
	if(outerTabs.length === 0) return Promise.reject(`getNumHostReviews: No review tabs: ${outerTabs}`);

	const tabPromises = await outerTabs.map((tab) => {
		return tab.$$eval("div button", (buttonNodes) => {
			return (buttonNodes[0] as HTMLElement).innerText;
		});
	});

	const tabsText = await Promise.all(tabPromises);

	const reviewsByTab = tabsText.reduce((currVal, text: string) => {
		const match = text.match(/^From\s*([^\s]*)\s*\(([0-9]*)\)$/);
		if(!match || match.length !== 3) {
			console.error(`Unable to parse review tab button content: ${text} ${JSON.stringify(match)}`);
		} else {
			switch(match[1]) {
				case "guests":
					currVal.fromGuests = Number(match[2]);
					break;

				case "hosts":
					currVal.fromHosts = Number(match[2]);
					break;

				default:
					console.error(`Unexpected review tab title`);
					break;
			}
		}

		return currVal;
	}, {} as IAirbnbHostNumReviews);

	if(!reviewsByTab.fromGuests && !reviewsByTab.fromHosts) return Promise.reject(`Unable to find any expected review tab types: ${reviewsByTab}`);

	return Promise.resolve(reviewsByTab);
};

const getHostReviews = async (page: Page): Promise<IAirbnbHostReviews> => {
// 	const tabs: HTMLElement[] = getHostReviewTabs();

// 	console.error(`for all review tabs need to "get more reviews" until there are no more`);

// 	const tabReviews = tabs.reduce((currVal: IAirbnbHostReviews, tab) => {
// 		const all = Array.from(tab.parentElement!.parentElement!.parentElement!.querySelectorAll(":scope > div > div")) as HTMLElement[];
// 		const tabHeaderOuterDiv = all[0];

// 		// Examine headers to understand how many categories of reviews we need to examine.
// 		const tabHeaderDiv = Array.from(tabHeaderOuterDiv.querySelectorAll("div button")) as HTMLElement[];
// 		console.assert(tabHeaderDiv.length > 0, `Unable to find review tabs button`);

// 		const tabTypes: string[] = tabHeaderDiv.map((tab) => {
// 			const reviewType = parseHostReviewType(tab.innerText);
// 			console.assert(reviewType, `unknown review type ${reviewType}`);
// 			return (reviewType === "guests") ? "fromGuests" : "fromHosts";
// 		});

// 		// FIXME: Need to select the tab we want.
// 		// FIXME: Need to view all the reviews.

// 		//
// 		// const thisTabsReviewDivs = all.slice(1);
// 		// currVal[index] = thisTabsReviewDivs.map((div) => {
// 		// 	const content = Array.from(div.querySelectorAll(":scope > div > div:nth-child(2) > div > div")) as HTMLElement[];
// 		// 	console.assert(content.length === 1, `Found too many tab review content sub divs`);

// 		// 	return {
// 		// 		content: content[0].innerText,
// 		// 	};
// 		// });

// 		return currVal;
// 	}, {fromGuests: [], fromHosts: []} as IAirbnbHostReviews);

	return Promise.reject(`getHostReviews not implemented`);

	// const tabReviews = {
	// 	fromGuests: [],
	// 	fromHosts: [],
	// };

	// return Promise.resolve(tabReviews);
};
