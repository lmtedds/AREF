const minMsDelay = 50; // 50ms
const typingInterCharacterDelay = 200; // 200ms delay to more closely resemble a human.
const mouseClickUpDownDelay = 200; // 200ms delay to more closely resemble a human.

export const delay = (delayInMs: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, delayInMs));
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
