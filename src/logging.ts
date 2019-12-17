import { createLogger, format, LeveledLogMethod, Logger, transports } from "winston";

import { cmdParameters } from "./cmdline";

export interface IExtendedLogger extends Logger {
	assert: (boolExpr: any, ...args: any[]) => Logger;
}

export const logger: IExtendedLogger = createLogger({
	format: format.combine(
		format.timestamp({
			format: "YYYY-MM-DD HH:mm:ss",
		}),
		format.errors({ stack: true }),
		format.splat(),
		format.json(),
	),
	transports: [
		new transports.Console({level: cmdParameters.logLevelConsole}),
		new transports.File({ filename: `${cmdParameters.out}/operation.log`, level: cmdParameters.logLevelFile }),
	],
}) as IExtendedLogger;

logger.assert = function(boolExpr: any, ...args: any[]): Logger {
	const expr = !!boolExpr;

	if(!expr) {
		return this.error(args);
	}

	return this;
};
