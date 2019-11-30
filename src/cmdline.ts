import * as path from "path";

import * as parseArgs from "minimist";

export interface ICmdParameters {
	_: any[];
	help?: boolean;
	out: string;
	roomIdFile?: string;
	hostIdFile?: string;
	city?: string;
	province?: string;
	filePermissions: number;
	maxPagesOpen: number;
	headless: boolean;
}

const opts = {
	boolean: [
		"help",
		"headless",
	],
	string: [
		"out",
		"roomIdFile",
		"hostIdFile",
		"city",
		"province",
		"filePermissions",
		"maxPagesOpen",
	],
	default: {
		filePermissions: "444",
		maxPagesOpen: 6,
		headless: false,
	},
	unknown: outputHelpAndExit,
};

const callingArgs = process.argv.slice(0, 2);
const argsToProcess = process.argv.slice(2);

export const cmdParameters: ICmdParameters = parseArgs(argsToProcess, opts as any) as ICmdParameters;

if(cmdParameters._.length > 0
	|| cmdParameters.help
	|| !cmdParameters.out
	|| ((!cmdParameters.city || !cmdParameters.province) && !(cmdParameters.roomIdFile || cmdParameters.hostIdFile))) {
	outputHelpAndExit();
}

cmdParameters.out = path.resolve(cmdParameters.out);

if(cmdParameters.roomIdFile) cmdParameters.roomIdFile = path.resolve(cmdParameters.roomIdFile);

if(typeof cmdParameters.filePermissions === "string") cmdParameters.filePermissions = parseInt(cmdParameters.filePermissions, 8);

function outputHelpAndExit(): void {
	console.error(`${callingArgs[0]} ${callingArgs[1]} --out <path to save files> [<optional arguments>]
	Options are:
		--out <path to save files> -> Directory to put output files into.
		--roomIdFile <path to room id json file> -> Don't scrape room ids for the city, just start from the data in the basic_data.json or room_failures.json file.
		--hostIdFile <path to host id json file> -> Don't scrape room ids for the city, just start from the data in the basic_data.json or room_failures.json file.
		--city <city> -> Name of the city to scrape. Must be provided if not using --roomIdFile or --hostIdFile.
		--province <province> -> Name of the province to scrape. Must be provided if not using --roomIdFile or --hostIdFile.
		--filePermissions <file permissions octal> -> Generate files with this permission (e.g. "644" -> 0o644). Default is ${opts.default.filePermissions}.
		--maxPagesOpen <number of pages processed at same time> -> Set the max number of pages to operate on at once. Default is ${opts.default.maxPagesOpen}.
		--headless -> Run without displaying the GUI. Default is ${opts.default.headless}.
		--help -> Display this usage message.

	You invoked with:
	${JSON.stringify(process.argv)}
	`);

	process.exit(1);
}
