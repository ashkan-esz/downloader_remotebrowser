import config from "./config/index.js";
import {fileURLToPath} from "url";
import os from "os";
import nou from "node-os-utils";
import checkDiskSpace from 'check-disk-space';
import {getBrowserPid} from "./browser/puppetterBrowser.js";
import pidusage from "pidusage";
import {getDatesBetween, getDownloadFilesTotalSize} from "./files/files.js";
import {saveError} from "./saveError.js";
import {saveCrawlerWarning} from "./db/serverAnalysisDbMethods.js";

nou.options.INTERVAL = 10000;

export const crawlerMemoryLimit = (config.memoryLimit || (config.totalMemoryAmount * 0.95)) - 15;

const status = {
    uploadAndDownloadFiles: [],
    downloadCounter: 0,
    uploadCounter: 0,
    uploadJobRunning: false,
    blackHoleUpload: {
        time: 0,
        message: '',
        state: '',
    },
    lastTimeCrawlerUse: 0,
    pageLinks: [],
    pauseData: {
        isPaused: false,
        pauseReason: '',
        pausedFrom: 0,
        totalPausedDuration: 0,
    },
    crawlerState: 'ok',
}

export function getServerStatusFlags() {
    return status;
}

export function isCrawlerActive() {
    return status.pageLinks.length > 0 || (status.lastTimeCrawlerUse && getDatesBetween(new Date(), status.lastTimeCrawlerUse).minutes < 5);
}

//-----------------------------------
//-----------------------------------

export function updateBlackHoleUploadMessage(message, time, state) {
    status.blackHoleUpload.message = message;
    status.blackHoleUpload.time = time;
    status.blackHoleUpload.state = state;
}

//-----------------------------------
//-----------------------------------

export function addPageLinkToCrawlerStatus(pageLink) {
    status.lastTimeCrawlerUse = new Date();

    pageLink = getDecodedLink(pageLink);
    if (!status.pageLinks.find(item => item.url === pageLink)) {
        status.pageLinks.push({
            url: pageLink,
            time: new Date(),
            state: 'start',
            stateTime: new Date(),
            type: '',
            retryCounter: 0,
        });
    }
}

export function changePageLinkStateFromCrawlerStatus(pageLink, type, state, retryCounter) {
    pageLink = getDecodedLink(pageLink);
    let data = status.pageLinks.find(item => item.url === pageLink);
    if (data) {
        data.state = state;
        data.type = type;
        data.stateTime = new Date();
        data.retryCounter = retryCounter;
    }
}

export function removePageLinkToCrawlerStatus(pageLink) {
    pageLink = getDecodedLink(pageLink);
    status.pageLinks = status.pageLinks.filter(item => item.url !== pageLink);
}

//-----------------------------------
//-----------------------------------

export async function pauseCrawler() {
    let memoryStatus = await getMemoryStatus();
    let cpuAverageLoad = getCpuAverageLoad();
    const startTime = Date.now();
    while (memoryStatus.used >= crawlerMemoryLimit || cpuAverageLoad[0] > 95) {
        if (Date.now() - startTime > config.pauseDurationLimit * 1000) {
            await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): Maximum allowed duration for crawler pause exceeded (${config.pauseDurationLimit}s) (crawler need more resource)`);
            break;
        }

        const pauseReason = memoryStatus.used >= crawlerMemoryLimit
            ? `memory/limit: ${memoryStatus.used.toFixed(0)}/${crawlerMemoryLimit.toFixed(0)} `
            : `cpu/limit: ${cpuAverageLoad[0]}/95`;
        saveCrawlerPause(pauseReason);
        await new Promise(resolve => setTimeout(resolve, 50));
        memoryStatus = await getMemoryStatus(false);
        cpuAverageLoad = getCpuAverageLoad();
    }
    removeCrawlerPause();
}

function saveCrawlerPause(reason) {
    if (status.pauseData.isPaused) {
        status.pauseData.pauseReason = reason;
        return "crawler is already paused";
    }
    status.crawlerState = 'paused';
    status.pauseData.isPaused = true;
    status.pauseData.pauseReason = reason;
    status.pauseData.pausedFrom = Date.now();
    return "ok";
}

function removeCrawlerPause() {
    if (!status.pauseData.isPaused) {
        return "crawler is not paused";
    }
    const pauseDuration = (Date.now() - status.pauseData.pausedFrom) / (60 * 1000);
    status.pauseData.isPaused = false;
    status.pauseData.pauseReason = '';
    status.pauseData.totalPausedDuration += pauseDuration;
    status.pauseData.pausedFrom = 0;
    status.crawlerState = 'ok';
    return "ok";
}

//-----------------------------------
//-----------------------------------

export async function getServerResourcesStatus() {
    let {filesTotalSize, files, dir} = await getDownloadFilesTotalSize();

    try {
        return ({
            now: new Date(),
            server: {
                serverName: config.serverName,
                hostName: os.hostname(),
                upTime: os.uptime() / 60,
                nodeUpTime: process.uptime() / 60,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
            },
            configs: {
                name: config.serverName,
                browserTabsCount: config.browserTabsCount,
                blackHole: {
                    fileSizeLimit: config.blackHole.fileSizeLimit,
                },
                disableUploadJob: config.disableUploadJob,
                pauseDurationLimit: config.pauseDurationLimit,
            },
            crawlerStatus: {
                lastTimeCrawlerUse: status.lastTimeCrawlerUse,
                pageLinks: status.pageLinks,
                memoryLimit: crawlerMemoryLimit,
                pauseData: status.pauseData,
                crawlerState: status.crawlerState,
            },
            cpu: await getCpuStatus(),
            memoryStatus: await getMemoryStatus(),
            diskStatus: await getDiskStatus(filesTotalSize),
            filesStatus: {
                files: dir.map((fileName, index) => {
                    let temp = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
                    if (temp) {
                        return temp;
                    }
                    return ({
                        fileName: fileName,
                        size: (files[index]?.size || 0) / (1024 * 1024),
                        startDownload: '',
                        endDownload: '',
                        downloadLink: '',
                        isDownloading: false,
                        startUpload: '',
                        endUpload: '',
                        uploadLink: '',
                        isUploading: false,
                    });
                }),
                filesTotalSize: filesTotalSize,
                downloadCount: status.downloadCounter,
                uploadCount: status.uploadCounter,
                uploadJobRunning: status.uploadJobRunning,
                blackHoleUpload: status.blackHoleUpload,
            },
        });
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function getFilesStatus() {
    try {
        let {filesTotalSize, files, dir} = await getDownloadFilesTotalSize();

        return ({
            now: new Date(),
            files: dir.map((fileName, index) => {
                let temp = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
                if (temp) {
                    return temp;
                }
                return ({
                    fileName: fileName,
                    size: (files[index]?.size || 0) / (1024 * 1024),
                    startDownload: '',
                    endDownload: '',
                    downloadLink: '',
                    isDownloading: false,
                    startUpload: '',
                    endUpload: '',
                    uploadLink: '',
                    isUploading: false,
                });
            }),
            filesTotalSize: filesTotalSize,
            downloadCount: status.downloadCounter,
            uploadCount: status.uploadCounter,
            uploadJobRunning: status.uploadJobRunning,
            blackHoleUpload: status.blackHoleUpload,
        });
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-------------------------------------------
//-------------------------------------------

export async function getCpuStatus(includeUsage = true) {
    const puppeteerUsage = await getPuppeteerUsage();

    const cpu = nou.cpu;
    const result = {
        count: cpu.count(),
        model: cpu.model(),
        loadAvg: cpu.loadavg(),
        loadAvgTime: cpu.loadavgTime(),
        puppeteerCpu: puppeteerUsage?.cpu || 0,
    }
    if (includeUsage) {
        result.usage = await nou.cpu.usage(1000);
        result.free = await nou.cpu.free(1000);
    }
    return result;
}

export function getCpuAverageLoad() {
    return nou.cpu.loadavg();
}

export async function getMemoryStatus() {
    const memoryStatus = process.memoryUsage();
    const memoryStatus_os = await nou.mem.info();

    Object.keys(memoryStatus).forEach(key => {
        memoryStatus[key] = memoryStatus[key] / (1024 * 1024)
    });

    const puppeteerUsage = await getPuppeteerUsage();
    let puppeteerUsage_memory = puppeteerUsage ? puppeteerUsage.memory / (1024 * 1024) : 0;

    return ({
        total: config.totalMemoryAmount,
        used_node: memoryStatus.rss,
        used_pupputeer: puppeteerUsage_memory,
        used: puppeteerUsage_memory + memoryStatus.rss,
        free: config.totalMemoryAmount - (memoryStatus.rss + puppeteerUsage_memory),
        allData: memoryStatus,
        memoryStatus_os: {
            total: memoryStatus_os.totalMemMb,
            used: memoryStatus_os.usedMemMb,
            free: memoryStatus_os.freeMemMb,
        },
        memoryStatus_os2: {
            total: os.totalmem() / (1024 * 1024),
            used: (os.totalmem() - os.freemem()) / (1024 * 1024),
            free: os.freemem() / (1024 * 1024),
        }
    });
}

export async function getDiskStatus(filesTotalSize) {
    const __filename = fileURLToPath(import.meta.url);
    let diskStatus_os = await checkDiskSpace('/' + (__filename.split('/')[1] || ''));

    return ({
        total: config.totalDiskSpace,
        used: config.defaultUsedDiskSpace + filesTotalSize,
        free: config.totalDiskSpace - (config.defaultUsedDiskSpace + filesTotalSize),
        diskStatus_os: {
            diskPath: diskStatus_os.diskPath,
            total: diskStatus_os.size / (1024 * 1024),
            used: (diskStatus_os.size - diskStatus_os.free) / (1024 * 1024),
            free: diskStatus_os.free / (1024 * 1024),
        }
    });
}

async function getPuppeteerUsage() {
    try {
        let puppeteerPid = getBrowserPid();
        return puppeteerPid ? await pidusage(puppeteerPid) : null;
    } catch (error) {
        if (error.message !== "No matching pid found" && error.message !== "ESRCH: no such process, read") {
            saveError(error);
        }
        return null;
    }
}

//-------------------------------------------
//-------------------------------------------

export function getDecodedLink(link) {
    let decodedLink = link;
    try {
        decodedLink = decodeURIComponent(decodedLink);
    } catch (error) {
    }
    return decodedLink;
}