export type AirbnbRoomId = string;
export type AirbnbHostId = string;

export interface IAirbnbReview {
	content: string;
}

export interface IAirbnbHostNumReviews {
	fromGuests: number;
	fromHosts: number;
}

export interface IAirbnbHostReviews {
	fromGuests: IAirbnbReview[];
	fromHosts: IAirbnbReview[];
}

export interface IAirbnbHost {
	id: AirbnbHostId;
	name: string;
	superHost: boolean;
	hostListings: AirbnbRoomId[];

	numReviews: IAirbnbHostNumReviews;
	// reviews: IAirbnbHostReviews;
}

export enum AirbnbRoomType {
	PRIVATE_ROOM = "Private room",
	SHARED_ROOM = "Shared room",

	ROOM_IN_HOUSE = "Room",
	FARM_STAY = "Farm stay",
	CAVE_STAY = "Cave",
	ENTIRE_LOFT = "Entire loft",

	ENTIRE_HOME = "Entire home",
	ENTIRE_HOUSE = "Entire house",
	ENTIRE_TOWNHOUSE = "Entire townhouse",
	ENTIRE_BUNGALOW = "Entire bungalow",
	ENTIRE_CONDOMINIUM = "Entire condominium",
	ENTIRE_APARTMENT = "Entire apartment",
	ENTIRE_SERVICED_APARTMENT = "Entire serviced apartment",
	ENTIRE_CABIN = "Entire cabin",
	ENTIRE_COTTAGE = "Entire cottage",

	ENTIRE_GUEST_HOUSE = "Entire guesthouse",
	ENTIRE_GUEST_SUITE = "Entire guest suite",

	ROOM_IN_HOTEL = "Room in hotel",

	ERROR = "SWERR",
}

export interface IAirbnbRoomStats {
	guests: number;
	bedrooms: number;
	beds: number;
	bathrooms: number;
}

export interface IAirbnbListing {
	id: AirbnbRoomId;
	url: string;
	title: string;
	type: AirbnbRoomType;
	hostUri: string;
	hostId: AirbnbHostId;
	coHostUris: string[];
	coHostIds: AirbnbHostId[];
	numReviews: number;
	price: number;
	guests: number;
	bedrooms: number;
	beds: number;
	bathrooms: number;
}

export interface IAirbnbDataBase {
	city: string;
	province: string;
}

export interface IAirbnbRoomIdScrapeData extends IAirbnbDataBase  {
	rooms: AirbnbRoomId[];
}

export interface IAirbnbRoomScrapeData extends IAirbnbDataBase {
	data: {
		[roomId: string]: IAirbnbListing;
	};
}

export interface IAirbnbFailureReason {
	url: string;
	msg: string;
	stack: string;
}

// Failure file can be use the same as IAirbnbRoomIdScrapeData to start using --basicFile
export interface IAirbnbRoomFailureData extends IAirbnbRoomIdScrapeData {
	numFailures: number;
	data: {
		[roomId: string]: IAirbnbFailureReason;
	};
}

// List of hosts generated through room parsing
export interface IAirbnbRoomHostScrapeData extends IAirbnbDataBase {
	hosts: AirbnbHostId[];
	coHosts: AirbnbHostId[];
}
