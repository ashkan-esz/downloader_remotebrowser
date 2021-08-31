const Sentry = require('@sentry/node');

export async function saveError(error) {
    if (process.env.NODE_ENV === 'production') {
        await Sentry.captureException(error);
    } else {
        console.log(error);
        console.log();
    }
}
