import config from "./config/index.js";
import * as Sentry from "@sentry/node";

export async function saveError(error) {
    if (config.nodeEnv === 'production') {
        Sentry.captureException(error);
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
