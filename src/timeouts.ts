const minMsDelay = 50; // 50ms
const typingInterCharacterDelay = 200; // 200ms delay to more closely resemble a human.
const mouseClickUpDownDelay = 400; // 400ms delay to more closely resemble a human.

// Delay for at least delayInMs seconds.
export const delay = (delayInMs: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, delayInMs));
};

// Delay for at least delayInMs seconds but most likely more. The delay will change
// between calls to simulate a human decision making process prior to action.
export const fuzzyDelay = (delayInMs: number): Promise<void> => {
	delayInMs = fuzzDelay(delayInMs);

	return delay(delayInMs);
};

export const getKeyboardDelays = () => {
	return {
		interCharacter: fuzzDelay(typingInterCharacterDelay),
	};
};

export const getMouseDelays = () => {
	return {
		upDown: fuzzDelay(mouseClickUpDownDelay),
	};
};

const fuzzDelay = (delayInMs: number): number => {
	const random = 2 * Math.random();
	const fuzzed = delayInMs * random;

	return fuzzed > minMsDelay ? fuzzed : minMsDelay;
};
