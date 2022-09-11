import config from "./config/index.js";
import * as Sentry from "@sentry/node";

export async function saveError(error, moreInfo = false) {
    if (config.nodeEnv === 'production') {
        if (moreInfo) {
            Sentry.withScope(function (scope) {
                scope.setExtra('ErrorData', error);
                scope.setTag("ErrorData", "ErrorData");
                Sentry.captureException(error);
            });
        } else {
            Sentry.captureException(error);
        }
        if (config.printErrors === 'true') {
            console.trace();
            console.log(error);
            console.log();
        }
    } else {
        console.trace();
        console.log(error);
        console.log();
    }
}
