import * as path from "path";

import * as parseArgs from "minimist";

export interface ICmdParameters {
	_: any[];
	help?: boolean;
	out: string;
	basicFile?: string;
	city?: string;
	province?: string;
	filePermissions: number;
}

const opts = {
	boolean: [
		"help",
	],
	string: [
		"out",
		"basicFile",
		"city",
		"province",
		"filePermissions",
	],
	default: {
		filePermissions: "444",
	},
	unknown: outputHelpAndExit,
};

const callingArgs = process.argv.slice(0, 2);
const argsToProcess = process.argv.slice(2);

export const cmdParameters: ICmdParameters = parseArgs(argsToProcess, opts as any) as ICmdParameters;

if(cmdParameters._.length > 0
	|| cmdParameters.help
	|| !cmdParameters.out
	|| ((!cmdParameters.city || !cmdParameters.province) && !cmdParameters.basicFile)) {
	outputHelpAndExit();
}

cmdParameters.out = path.resolve(cmdParameters.out);

if(cmdParameters.basicFile) cmdParameters.basicFile = path.resolve(cmdParameters.basicFile);

if(typeof cmdParameters.filePermissions === "string") cmdParameters.filePermissions = parseInt(cmdParameters.filePermissions, 8);

function outputHelpAndExit(): void {
	console.error(`${callingArgs[0]} ${callingArgs[1]} --out <path to save files> [<optional arguments>]
	Options are:
		--out <path to save files> -> Directory to put output files into.
		--basicFile <path to room json file> -> Don't scrape room ids for the city, just start from the data in the basic data or room failed file.
		--city <city> -> Name of the city to scrape. Must be provided if not using --basicFile.
		--province <province> -> Name of the province to scrape. Must be provided if not using --basicFile.
		--filePermissions <file permissions octal> -> Generate files with this permission (e.g. "644" -> 0o644). Default is ${opts.default.filePermissions}.
		--help -> Display this usage message.

	You invoked with:
	${JSON.stringify(process.argv)}
	`);

	process.exit(1);
}
