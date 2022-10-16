import config from "../config/index.js";
import Agenda from "agenda";
import {startUploadJob} from "../files/files.js";
import {saveError} from "../saveError.js";


let agenda = new Agenda({
    db: {address: config.databaseURL, collection: 'remoteBrowser_agendaJobs'},
    processEvery: '1 minute',
});


export async function startAgenda() {
    try {
        agenda.define("start uploadJob", {concurrency: 1, priority: "highest", shouldSaveResult: true}, async (job) => {
            if (config.disableUploadJob !== 'true' && config.databaseURL) {
                await removeCompletedJobs();
                await startUploadJob();
            }
        });

        await agenda.start();
        //for more info check https://crontab.guru
        await agenda.every("0 */2 * * *", "start uploadJob", {}); //Every two hour
    } catch (error) {
        saveError(error);
    }
}

async function removeCompletedJobs() {
    try {
        await agenda.cancel({nextRunAt: null, failedAt: null});
    } catch (error) {
        saveError(error);
    }
}

export default agenda;

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);

async function graceful() {
    await agenda.stop();
    process.exit(0);
}
