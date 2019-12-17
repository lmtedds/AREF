import * as fs from "fs";
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
	startDate?: Date;
	endDate?: Date;

	logLevel: string;
	logLevelConsole: string;
	logLevelFile: string;
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
		"startDate",
		"endDate",
		"logLevel",
		"logLevelConsole",
		"logLevelFile",
	],
	default: {
		logLevel: "debug",
		filePermissions: "444",
		maxPagesOpen: 1,
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
	|| ((!cmdParameters.city || !cmdParameters.province) && !(cmdParameters.roomIdFile || cmdParameters.hostIdFile))
	|| (cmdParameters.startDate && !cmdParameters.endDate)
	|| (cmdParameters.endDate && !cmdParameters.startDate)) {
	outputHelpAndExit();
}

// We'll let things continue, but indicate that headful with multiple workers doesn't work
if(!cmdParameters.headless && cmdParameters.maxPagesOpen > 1) console.warn(`WARN: Multiple workers in headful mode doesn't work as expected. ${cmdParameters.maxPagesOpen} workers will act more like 1 worker`);

// relative to absolute path
cmdParameters.out = path.resolve(cmdParameters.out);

// relative to absolute path
if(cmdParameters.roomIdFile) cmdParameters.roomIdFile = path.resolve(cmdParameters.roomIdFile);

// String -> number
if(typeof cmdParameters.filePermissions === "string") cmdParameters.filePermissions = parseInt(cmdParameters.filePermissions, 8);

// String -> date (support YYYY-MM-DDTHH:mm:ss.sssZ per http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15)
if(typeof cmdParameters.startDate === "string") cmdParameters.startDate = new Date(cmdParameters.startDate);
if(typeof cmdParameters.endDate === "string") cmdParameters.endDate = new Date(cmdParameters.endDate);

// Log levels - set console and file levels to overall log level if they are not provided.
if(typeof cmdParameters.logLevel !== "string") outputHelpAndExit();
cmdParameters.logLevelConsole = cmdParameters.logLevelConsole || cmdParameters.logLevel;
cmdParameters.logLevelFile = cmdParameters.logLevelFile || cmdParameters.logLevel;

// Make sure all output directories exist
fs.mkdirSync(cmdParameters.out, {recursive: true});

function outputHelpAndExit(): void {
	console.error(`${callingArgs[0]} ${callingArgs[1]} --out <path to save files> [<optional arguments>]
	Options that require parameters are:
		--out <path to save files> -> Directory to put output files into.
		--roomIdFile <path to room id json file> -> Don't scrape room ids for the city, just start from the data in the basic_data.json or room_failures.json file.
		--hostIdFile <path to host id json file> -> Don't scrape room ids for the city, just start from the data in the basic_data.json or room_failures.json file.
		--city <city> -> Name of the city to scrape. Must be provided if not using --roomIdFile or --hostIdFile.
		--province <province> -> Name of the province to scrape. Must be provided if not using --roomIdFile or --hostIdFile.
		--startDate <date string in iso format> -> start date (inclusive) for availability. In YYYY-MM-DDTHH:mm:ss.sssZ format but note defaults to UTC unless Z provided.
		--endDate <date string in iso format> -> end date (inclusive) for availability. In YYYY-MM-DDTHH:mm:ss.sssZ format but note defaults to UTC unless Z provided.
		--filePermissions <file permissions octal> -> Generate files with this permission (e.g. "644" -> 0o644). Default is ${opts.default.filePermissions}.
		--maxPagesOpen <number of pages processed at same time> -> Set the max number of pages to operate on at once. Default is ${opts.default.maxPagesOpen}.

	Options for logging are:
		NOTE: All file log messages are output into the directory specified by --out
		--logLevel <name of level> -> Set the file and console log level to the specified value. Name of level is based off RFC5424. Default is '${opts.default.logLevel}'.
		--logLevelConsole <name of level> -> Set the console log level to a different level. Name of level is based off RFC5424. The default is what is set for --logLevel.
		--logLevelFile <name of level> -> Set the file log level to a different level. Name of level is based off RFC5424. The default is what is set for --logLevel.

	Options that do not require parameters are:
		--headless -> Run without displaying the GUI. Default is ${opts.default.headless}.
		--help -> Display this usage message.

	You invoked with:
	${JSON.stringify(process.argv)}
	`);

	process.exit(1);
}
