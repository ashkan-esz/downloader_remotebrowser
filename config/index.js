import dotenv from "dotenv";

dotenv.config({path: './.env'});

export default {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT || 3000,
    sentryDns: process.env.SENTRY_DNS,
    serverPassword: process.env.PASSWORD,
    printErrors: process.env.PRINT_ERRORS,
    browserTabsCount: Number(process.env.CRAWLER_BROWSER_TAB_COUNT) || 3,
    animelistEmail: process.env.ANIMELIST_EMAIL,
    animelistPassword: process.env.ANIMELIST_PASSWORD,
    captchaSolverEndpoint: process.env.CAPTCHA_SOLVER_ENDPOINT,
}
