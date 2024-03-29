import dotenv from "dotenv";
import {v4 as uuidv4} from "uuid";

dotenv.config({path: './.env'});

export default {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT || 5000,
    sentryDns: process.env.SENTRY_DNS,
    serverPassword: process.env.PASSWORD,
    printErrors: process.env.PRINT_ERRORS,
    crawlerMonitor: process.env.CRAWLER_MONITOR === 'true',
    browserTabsCount: Number(process.env.CRAWLER_BROWSER_TAB_COUNT) || 7,
    serverName: process.env.SERVER_NAME || uuidv4(),
    captchaSolverEndpoint: process.env.CAPTCHA_SOLVER_ENDPOINT,
    databaseURL: process.env.DATABASE_URL,
    blackHole: {
        password: process.env.BLACKHOLE_PASSWORD,
        fileSizeLimit: Number(process.env.BLACKHOLE_FILE_SIZE_LIMIT || 512),
    },
    disableUploadJob: process.env.DISABLE_UPLOAD_JOB === 'true',
    totalMemoryAmount: Number(process.env.TOTAL_MEMORY_AMOUNT || 768),
    memoryLimit: Number(process.env.CRAWLER_MEMORY_LIMIT || 0),
    pauseDurationLimit: Number(process.env.CRAWLER_PAUSE_DURATION_LIMIT || 30),
    totalDiskSpace: Number(process.env.TOTAL_DISK_SPACE || 1024),
    defaultUsedDiskSpace: Number(process.env.DEFAULT_USED_DISK_SPACE || 0), //estimate value based on heroku
    sources: {
        animeList: {
            username: process.env.ANIMELIST_USERNAME,
            password: process.env.ANIMELIST_PASSWORD,
        },
    }
}
