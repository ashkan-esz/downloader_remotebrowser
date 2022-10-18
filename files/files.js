import config from "../config/index.js";
import os from "os";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import * as stream from 'stream';
import {promisify} from 'util';
import nou from 'node-os-utils';
import checkDiskSpace from 'check-disk-space';
import pidusage from 'pidusage';
import {saveError} from "../saveError.js";
import axios from "axios";
import {executeUrl, getBrowserPid} from "../browser/puppetterBrowser.js";
import {getLinksDB, resetOutdatedFlagsDB, updateLinkDataDB} from "../db/torrentLinksCollection.js";
import * as Sentry from "@sentry/node";

const promisifiedFinished = promisify(stream.finished);

const status = {
    uploadAndDownloadFiles: [],
    downloadCounter: 0,
    uploadCounter: 0,
    uploadJobRunning: false,
    lastTimeCrawlerUse: 0,
}

try {
    await fs.promises.mkdir(path.join('.', 'downloadFiles'));
} catch (error) {
}

try {
    //remove leftover files
    let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
    for (let i = 0; i < dir.length; i++) {
        await fs.promises.unlink(path.join('.', 'downloadFiles', dir[i]));
    }
} catch (error) {
}

export function getStatus() {
    return status;
}

export function newCrawlerCall() {
    status.lastTimeCrawlerUse = new Date();
}

//-------------------------------------------------
//-------------------------------------------------
export async function startUploadJob() {
    try {
        if (status.uploadJobRunning) {
            return;
        }

        await resetOutdatedFlagsDB();
        let startTime = Date.now();
        //remove leftover files
        let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
        for (let i = 0; i < dir.length; i++) {
            let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === dir[i]);
            if (!fileData || (!fileData.isDownloading && !fileData.isUploading)) {
                await fs.promises.unlink(path.join('.', 'downloadFiles', dir[i]));
            }
        }

        //each upload job active for less than 2 hour
        while ((Date.now() - startTime) < 120 * 60 * 1000) {
            while (status.lastTimeCrawlerUse && getDatesBetween(new Date(), status.lastTimeCrawlerUse).minutes < 5) {
                status.uploadJobRunning = false;
                await new Promise(resolve => setTimeout(resolve, 30 * 1000)); //30s
                if ((Date.now() - startTime) >= 60 * 60 * 1000) {
                    return;
                }
            }
            status.uploadJobRunning = true;

            let filesData = await getLinksDB();
            let shouldUploadFiles = [];
            let noFileThatCanBeDownloaded = false;
            for (let i = 0; i < filesData.length; i++) {
                let downloadResult = await downloadFile(filesData[i].downloadLink, true, true);
                if (downloadResult.message === 'ok') {
                    shouldUploadFiles.push(downloadResult.fileData.fileName);
                } else if (downloadResult.message.includes("Low disk space") && i === 0 && status.downloadCounter === 0) {
                    noFileThatCanBeDownloaded = true;
                }
            }

            if (shouldUploadFiles.length > 0) {
                await uploadFiles(shouldUploadFiles, true);
            }
            if (shouldUploadFiles.length === 0 || noFileThatCanBeDownloaded) {
                Sentry.captureMessage("Warning: all files are larger than empty space");
                break;
            }
        }

        status.uploadJobRunning = false;
    } catch (error) {
        saveError(error);
        status.uploadJobRunning = false;
    }

}

//-------------------------------------------------
//-------------------------------------------------

export async function getFilesStatus() {
    try {
        let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
        let filesPromise = dir.map(file => fs.promises.stat(path.join('.', 'downloadFiles', file)));
        let files = (await Promise.allSettled(filesPromise)).map(item => item.value);
        let filesTotalSize = files.reduce((acc, file) => acc + (file?.size || 0), 0) / (1024 * 1024);

        const __filename = fileURLToPath(import.meta.url);
        let disStatus_os = await checkDiskSpace('/' + (__filename.split('/')[1] || ''));
        let memoryStatus_os = await nou.mem.info();

        let result = {
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
            lastTimeCrawlerUse: status.lastTimeCrawlerUse,
            disStatus: getDiskStatus(filesTotalSize),
            memoryStatus: await getMemoryStatus(),
            disStatus_os: {
                diskPath: disStatus_os.diskPath,
                total: disStatus_os.size / (1024 * 1024),
                used: (disStatus_os.size - disStatus_os.free) / (1024 * 1024),
                free: disStatus_os.free / (1024 * 1024),
            },
            memoryStatus_os: {
                total: memoryStatus_os.totalMemMb,
                used: memoryStatus_os.usedMemMb,
                free: memoryStatus_os.freeMemMb,
            },
            memoryStatus_os2: {
                total: os.totalmem() / (1024 * 1024),
                used: (os.totalmem() - os.freemem()) / (1024 * 1024),
                free: os.freemem() / (1024 * 1024),
            },
        }

        return result;
    } catch (error) {
        saveError(error);
        return null;
    }
}

//-------------------------------------------------
//-------------------------------------------------

export function getDiskStatus(filesTotalSize) {
    return ({
        total: config.totalDiskSpace,
        used: config.defaultUsedDiskSpace + filesTotalSize,
        free: config.totalDiskSpace - (config.defaultUsedDiskSpace + filesTotalSize),
    });
}

export async function getMemoryStatus() {
    let memoryStatus = process.memoryUsage();
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
        free: config.totalMemoryAmount - (memoryStatus.rss + puppeteerUsage_memory),
        allData: memoryStatus,
        puppeteerCpu: puppeteerUsage?.cpu || 0,
    });
}

//-------------------------------------------------
//-------------------------------------------------


export async function removeFile(fileName, newFileStatus = false) {
    try {
        if (status.uploadJobRunning) {
            return {
                message: 'Cannot delete files when uploadJob is running',
                filesStatus: newFileStatus ? await getFilesStatus() : null,
            };
        }

        let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
        let flag = false;
        if (fileData) {
            flag = true;
            if (fileData.isDownloading) {
                return {
                    message: 'Cannot delete downloading files',
                    filesStatus: newFileStatus ? await getFilesStatus() : null,
                };
            } else if (fileData.isUploading) {
                return {
                    message: 'Cannot delete uploading files',
                    filesStatus: newFileStatus ? await getFilesStatus() : null,
                };
            }
        }
        //file is okay to be removed
        await fs.promises.unlink(path.join('.', 'downloadFiles', fileName));
        if (flag) {
            //remove file data from uploadAndDownloadFiles array
            status.uploadAndDownloadFiles = status.uploadAndDownloadFiles
                .filter(item => item.fileName !== fileName);
        }
        return {
            message: 'ok',
            filesStatus: newFileStatus ? await getFilesStatus() : null,
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                message: 'Cannot find file ' + fileName,
                filesStatus: newFileStatus ? await getFilesStatus() : null,
            };
        }
        saveError(error);
        return {
            message: 'Internal server error',
            filesStatus: newFileStatus ? await getFilesStatus() : null,
        };
    }
}

export async function downloadFile(downloadLink, saveToDb, isUploadJob = false) {
    try {
        if (status.uploadJobRunning && !isUploadJob) {
            return {
                message: 'Cannot download files when uploadJob is running',
                fileData: null,
            };
        }

        let memoryStatus = await getMemoryStatus();
        if (memoryStatus.free <= 50) {
            return {
                fileData: null,
                message: `Low memory (free/total) : (${memoryStatus.free}/${memoryStatus.total} MB)`,
            };
        }

        let startTime = new Date();
        let response = await axios({
            method: 'get',
            url: downloadLink,
            responseType: 'stream',
        });
        let fileName = response.request.res.responseUrl.split('/').pop().split('?')[0];
        let fileSize = (Number(response.headers['content-length']) || 0) / (1024 * 1024);

        let checkFile = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
        if (checkFile) {
            if (checkFile.isDownloading) {
                return {
                    fileData: null,
                    message: 'File is downloading',
                };
            }
            if (checkFile.size === fileSize) {
                checkFile.downloadLink = downloadLink;
                if (!saveToDb) {
                    await uploadFiles([fileName]);
                    return {
                        fileData: checkFile,
                        message: 'ok',
                    };
                }

                return {
                    fileData: null,
                    message: 'File already exist',
                };
            }
        }

        let downloadingFilesSize = status.uploadAndDownloadFiles
            .filter(item => item.isDownloading)
            .reduce((acc, file) => acc + file.size, 0);
        let freeDiskSpace = getDiskStatus(downloadingFilesSize).free;
        if (downloadingFilesSize + fileSize > (freeDiskSpace - 10)) {
            return {
                fileData: null,
                message: `Low disk space (${freeDiskSpace}MB vs ${fileSize}MB)`,
            };
        }

        const writeStream = fs.createWriteStream(path.join('.', 'downloadFiles', fileName));
        response.data.pipe(writeStream);
        await addNewDownloadingFile(fileName, fileSize, downloadLink, startTime, saveToDb);
        await promisifiedFinished(writeStream); //this is a Promise
        let fileData = await fileDownloadEnd(fileName, saveToDb);

        if (!saveToDb) {
            await uploadFiles([fileName], saveToDb);
        }

        return {
            fileData: fileData,
            message: 'ok',
        };
    } catch (error) {
        saveError(error);
        return {
            fileData: null,
            message: 'Internal server error',
        };
    }
}

export async function uploadFiles(fileNames, saveToDb) {
    return await executeUrl('', false, fileNames, saveToDb, 'uploadFile');
}

//-------------------------------------------------
//-------------------------------------------------

async function addNewDownloadingFile(fileName, fileSize, downloadLink, startTime, saveToDb) {
    let newFileData = {
        fileName: fileName,
        size: fileSize,
        startDownload: startTime,
        endDownload: '',
        downloadLink: downloadLink,
        isDownloading: true,
        startUpload: '',
        endUpload: '',
        uploadLink: '',
        isUploading: false,
    };
    status.uploadAndDownloadFiles.push(newFileData);
    status.downloadCounter++;
    if (saveToDb) {
        await updateLinkDataDB(newFileData.downloadLink, {
            fileName: fileName,
            size: fileSize,
            startDownload: startTime,
            isDownloading: true,
        });
    }
}

async function fileDownloadEnd(fileName, saveToDb) {
    let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.endDownload = new Date();
        fileData.isDownloading = false;
        status.downloadCounter--;
        if (saveToDb) {
            await updateLinkDataDB(fileData.downloadLink, {
                endDownload: fileData.endDownload,
                isDownloading: false,
            });
        }
    }
    return fileData;
}

export async function uploadFileStart(fileName, saveToDb) {
    let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.startUpload = new Date();
        fileData.isUploading = true;
        status.uploadCounter++;
        if (saveToDb) {
            await updateLinkDataDB(fileData.downloadLink, {
                startUpload: fileData.startUpload,
                isUploading: true,
            });
        }
    }
    return fileData;
}

export async function uploadFileEnd(fileName, uploadLink, saveToDb, onError = false) {
    let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.endUpload = onError ? 0 : new Date();
        fileData.isUploading = false;
        fileData.uploadLink = uploadLink;
        status.uploadCounter--;
        await fs.promises.unlink(path.join('.', 'downloadFiles', fileName));
        status.uploadAndDownloadFiles = status.uploadAndDownloadFiles.filter(item => item.fileName !== fileName);
        if (saveToDb) {
            await updateLinkDataDB(fileData.downloadLink, {
                endUpload: fileData.endUpload,
                uploadLink: fileData.uploadLink,
                isUploading: false,
            });
        }
    }
    return fileData;
}

export async function removeFiles(fileNames) {
    for (let i = 0; i < fileNames.length; i++) {
        try {
            await fs.promises.unlink(path.join('.', 'downloadFiles', fileNames[i]));
        } catch (error) {
            saveError(error);
        }
    }
}

//-------------------------------------------------
//-------------------------------------------------

export function getDatesBetween(date1, date2) {
    let milliseconds = date1.getTime() - date2.getTime();
    let seconds = milliseconds / 1000;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let days = hours / 24;
    return {
        milliseconds,
        seconds,
        minutes: Number(minutes.toFixed(2)),
        hours: Number(hours.toFixed(2)),
        days: Number(days.toFixed(2)),
    };
}
