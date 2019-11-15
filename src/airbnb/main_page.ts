// Landing page

const getGoogleMap = (): HTMLElement => {
	const divs = document.querySelectorAll("div[role=complementary] > div[data-veloute='map/GoogleMap']");
	console.assert(divs.length === 1, `should be only 1 google map div: found ${divs.length}`);

	return divs[0] as HTMLElement;
};

const getMapDimensions = (): {w: number; h: number} => {
	const mapDiv = getGoogleMap();
	return {
		h: mapDiv.clientHeight,
		w: mapDiv.clientWidth,
	};
};

// Can get geocode bounding box here
// https://developer.here.com/api-explorer/rest/geocoder/latitude-longitude-by-mapview-parameter
