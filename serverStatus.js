import config from "./config/index.js";
import {fileURLToPath} from "url";
import os from "os";
import nou from "node-os-utils";
import checkDiskSpace from 'check-disk-space';
import {getBrowserPid} from "./browser/puppetterBrowser.js";
import pidusage from "pidusage";
import {getDatesBetween, getDownloadFilesTotalSize} from "./files/files.js";
import {saveError} from "./saveError.js";

nou.options.INTERVAL = 10000;

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
}

export function getServerStatusFlags() {
    return status;
}

export function isCrawlerActive() {
    return status.lastTimeCrawlerUse && getDatesBetween(new Date(), status.lastTimeCrawlerUse).minutes < 5;
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

export function addPageLinkToCrawlerStatus(pageLink, pageNumber) {
    status.lastTimeCrawlerUse = new Date();

    pageLink = getDecodedLink(pageLink);
    if (!status.pageLinks.find(item => item.url === pageLink)) {
        status.pageLinks.push({
            url: pageLink,
            pageNumber: pageNumber,
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

export async function getServerResourcesStatus() {
    let {filesTotalSize, files, dir} = await getDownloadFilesTotalSize();

    try {
        return ({
            now: new Date(),
            server: {
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
            },
            crawlerStatus: {
                lastTimeCrawlerUse: status.lastTimeCrawlerUse,
                pageLinks: status.pageLinks,
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

    let puppeteerPid = getBrowserPid();
    let puppeteerUsage = puppeteerPid ? await pidusage(puppeteerPid) : null;

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

export async function getMemoryStatus() {
    const memoryStatus = process.memoryUsage();
    const memoryStatus_os = await nou.mem.info();

    Object.keys(memoryStatus).forEach(key => {
        memoryStatus[key] = memoryStatus[key] / (1024 * 1024)
    });

    let puppeteerPid = getBrowserPid();
    let puppeteerUsage = puppeteerPid ? await pidusage(puppeteerPid) : null;
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