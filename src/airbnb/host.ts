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

export const parseHostListing = (): IAirbnbHost => {
	return {
		id: "7", // FIXME: getHostId(),
		name: getHostName(),
		superHost: isSuperHost(),
		hostListings: getHostsListings(),
		reviews: getHostReviews(),
	};
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

const getHostName = (): string => {
	const salutationDivs = document.querySelectorAll("div._1ekkhy94");
	console.assert(salutationDivs.length === 1);

	const salutation: string = (salutationDivs[0] as HTMLDivElement).innerText;

	const name = salutation.replace(`Hi, I’m `, ``);

	return name;
};

const isSuperHost = (): boolean => {
	// FIXME: This is probably fairly fragile going for an autogenerated class.
	const divs = Array.from(document.querySelectorAll("div._czm8crp")) as HTMLElement[];
	console.assert(divs.length > 0, `Unable to find isSuperHost divs`);

	const theDiv = divs.find((div: HTMLElement) => {
		return div.innerText === "Superhost";
	});

	return !!theDiv;
};

const getHostLocation = (): string => {
	// FIXME: This is probably fairly fragile going for an autogenerated class.
	const divs = Array.from(document.querySelectorAll("div._910j1c5")) as HTMLElement[];
	console.assert(divs.length > 0, `Unable to find getHostLocation divs`);

	const theDiv = divs.find((div: HTMLElement) => {
		return div.innerText.startsWith("Lives in ");
	});
	console.assert(theDiv, `Unable to find host location div`);

	return theDiv ? theDiv.innerText.replace("Lives in ", "") : "ERROR FINDING LOCATION";
};

const getHostListingSection = (): HTMLElement | undefined | null => {
	// Find the div which has text "${getHostName()}'s listings" the go up to find the section.

	// FIXME: This is probably fairly fragile going for an autogenerated class.
	const divs = Array.from(document.querySelectorAll("section > h1 > div")) as HTMLElement[];
	console.assert(divs.length > 0, `Unable to find host listing section divs`);

	const theDiv = divs.find((div: HTMLElement) => {
		return div.innerText.startsWith(getHostName());
	});
	console.assert(theDiv, `Unable to find host listing section div`);

	// If we have a div, then go up to find the parent section.
	let section: HTMLElement | undefined | null = theDiv;
	while(section) {
		section = section.parentElement;

		if(section && section.tagName === "SECTION") break;
	}

	return section;
};

const getHostsListings = (): AirbnbRoomId[] => {
	const listingSection: HTMLElement | null | undefined = getHostListingSection();

	if(!listingSection) return [];

	// Get all the link tag's hrefs. Then make them unique by throwing into a Set as there are
	// likely 2 links for the same listing.
	const hrefSet = new Set(Array.from(listingSection.querySelectorAll("a")).map((aTag) => aTag.href));

	return Array.from(hrefSet.values());
};

const getHostReviewSection = (): HTMLElement | null => {
	// Find the h1 #review-section-title

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
};

const getHostReviewTabs = (): HTMLElement[] => {
	const reviewSection: HTMLElement | null | undefined = getHostReviewSection();

	if(!reviewSection) return [];

	const divs = Array.from(reviewSection.querySelectorAll("div[role=tablist]")) as HTMLElement[];
	console.assert(divs.length === 1, `Unable to find reviews tabs div`);

	return Array.from(divs[0].children) as HTMLElement[];
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

const getNumHostReviews = (): IAirbnbHostNumReviews => {
	const tabs: HTMLElement[] = getHostReviewTabs();

	if(tabs.length === 0) {
		return {
			fromGuests: -1,
			fromHosts: -1,
		};
	}

	const reviewsByTab = tabs.reduce((currVal, tab) => {
		const info = Array.from(tab.querySelectorAll("div button")) as HTMLElement[];
		console.assert(info.length > 0, `Unable to find review tabs button`);

		const innerText = info[0].innerText;

		const match = innerText.match(/^From\s*([^\s]*)\s*\(([0-9]*)\)$/);
		if(!match || match.length !== 3) {
			console.error(`Unable to parse review tab button content: ${innerText} ${JSON.stringify(match)}`);
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

	return reviewsByTab;
};

const getHostReviews = (): IAirbnbHostReviews => {
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

	const tabReviews = {
		fromGuests: [],
		fromHosts: [],
	};

	console.error(`not implemented`);

	return tabReviews;
};
