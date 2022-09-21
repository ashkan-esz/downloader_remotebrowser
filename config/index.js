import dotenv from "dotenv";

dotenv.config({path: './.env'});

export default {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT || 3000,
    sentryDns: process.env.SENTRY_DNS,
    serverPassword: process.env.PASSWORD,
    printErrors: process.env.PRINT_ERRORS,
    crawlerMonitor: process.env.CRAWLER_MONITOR,
    browserTabsCount: Number(process.env.CRAWLER_BROWSER_TAB_COUNT) || 3,
    animelistEmail: process.env.ANIMELIST_EMAIL,
    animelistPassword: process.env.ANIMELIST_PASSWORD,
    captchaSolverEndpoint: process.env.CAPTCHA_SOLVER_ENDPOINT,
    blackHole: {
        password: process.env.BLACKHOLE_PASSWORD,
        fileSizeLimit: Number(process.env.BLACKHOLE_FILE_SIZE_LIMIT || 512),
    }
}
