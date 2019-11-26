import * as path from "path";

import * as parseArgs from "minimist";

export interface ICmdParameters {
	_: any[];
	help: boolean;
	out: string;
}

const opts = {
	boolean: [
		"help",
	],
	string: [
		"out",
	],
};

const callingArgs = process.argv.slice(0, 2);
const argsToProcess = process.argv.slice(2);

export const cmdParameters: ICmdParameters = parseArgs(argsToProcess, opts) as ICmdParameters;

if(cmdParameters._.length > 0
	|| cmdParameters.help
	|| !cmdParameters.out) {
	console.error(`${callingArgs[0]} ${callingArgs[1]} --out <path to save files>
	Options are:
		--out <path to save files> -> directory to put output files into
		--help -> display this usage message
	`);

	process.exit(1);
}

cmdParameters.out = path.resolve(cmdParameters.out);
