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
	PRIVATE_ROOM = "Private room in house",
	SHARED_ROOM = "FIXME",
	ENTIRE_HOUSE = "Entire home",

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
	title: string;
	type: AirbnbRoomType;
	hostUri: string;
	hostId: AirbnbHostId;
	price: number;
	guests: number;
	bedrooms: number;
	beds: number;
	bathrooms: number;
}
