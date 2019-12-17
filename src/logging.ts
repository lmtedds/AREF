import { Colorizer, Format, TransformableInfo } from "logform";
import { MESSAGE } from "triple-beam";
import { createLogger, format, LeveledLogMethod, Logger, transports } from "winston";

import { cmdParameters } from "./cmdline";

export interface IExtendedLogger extends Logger {
	assert: (boolExpr: any, ...args: any[]) => Logger;
}

const date = new Date();
const logFileName = `${cmdParameters.out}/${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}_${date.getTime()}_operation.log`;

class ConsoleFormat {
	public options: any;

	private colorizer: Colorizer;

	constructor(opts = {}) {
		this.options = opts;

		this.colorizer = format.colorize(opts);
	}

	/*
	 * function transform (info, opts)
	 * Attempts to both:
	 * 1. Pad the { level }
	 * 2. Colorize the { level, message }
	 *    of the given `logform` info object depending on the `opts`.
	 * 3. Add a timestamp
	 */
	public transform = (info: TransformableInfo, opts: any): TransformableInfo | boolean => {
		this.colorizer.transform(info, opts);

		info[MESSAGE] = `${( new Date() ).getTime()}:${info.level}:${info.message}`;

		return info;
	}
}

export const logger: IExtendedLogger = createLogger({
	transports: [
		new transports.Console({
			// format: format.combine(
			// 	format.timestamp({
			// 		format: "YYYY-MM-DD HH:mm:ss",
			// 	}),
			// 	format.errors({ stack: true }),
			// 	format.splat(),
			// 	format.json(),
			// 	// format.colorize({colors: {error: "red", warn: "yellow", info: "white"}}),
			// 	format.cli(),
			// ),
			format: new ConsoleFormat(),
			level: cmdParameters.logLevelConsole,
		}),
		new transports.File({
			filename: logFileName,
			format: format.combine(
				format.timestamp({
					format: "YYYY-MM-DD HH:mm:ss",
				}),
				format.errors({ stack: true }),
				format.splat(),
				format.json(),
			),
			level: cmdParameters.logLevelFile,
		}),
	],
}) as IExtendedLogger;

logger.assert = function(boolExpr: any, ...args: any[]): Logger {
	const expr = !!boolExpr;

	if(!expr) {
		this.error("Assertion failure! Failure report below");
		return this.error(args);
	}

	return this;
};
