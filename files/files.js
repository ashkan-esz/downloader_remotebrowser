import axios from "axios";
import fs from "fs";
import path from "path";
import * as stream from 'stream';
import {promisify} from 'util';
import {saveError} from "../saveError.js";
import {executeUrl} from "../browser/puppetterBrowser.js";
import {getLinksDB, resetOutdatedFlagsDB, updateLinkDataDB} from "../db/LinksCollection.js";
import {getDiskStatus, getFilesStatus, getMemoryStatus, getServerStatusFlags} from "../serverStatus.js";
import {saveCrawlerWarning} from "../db/serverAnalysisDbMethods.js";
import config from "../config/index.js";

const promisifiedFinished = promisify(stream.finished);

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

//-------------------------------------------------
//-------------------------------------------------
export async function startUploadJob() {
    let status = getServerStatusFlags();

    try {
        if (status.uploadJobRunning) {
            return;
        }

        //remove leftover files
        let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
        for (let i = 0; i < dir.length; i++) {
            let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === dir[i]);
            if (!fileData || (!fileData.isDownloading && !fileData.isUploading)) {
                await fs.promises.unlink(path.join('.', 'downloadFiles', dir[i]));
            }
        }

        await resetOutdatedFlagsDB();
        let startTime = Date.now();

        //each upload job active for less than 2 hour
        while ((Date.now() - startTime) < 120 * 60 * 1000) {
            while (status.lastTimeCrawlerUse && getDatesBetween(new Date(), status.lastTimeCrawlerUse).minutes < 5) {
                status.uploadJobRunning = false;
                await new Promise(resolve => setTimeout(resolve, 30 * 1000)); //30s
                if ((Date.now() - startTime) >= 60 * 60 * 1000) {
                    //after waiting for 60min to crawling stop
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
            if (noFileThatCanBeDownloaded) {
                await saveCrawlerWarning(`RemoteBrowser (${config.serverName})): uploadJob: all files are larger than empty space`);
                break;
            }
            if (shouldUploadFiles.length === 0) {
                status.uploadJobRunning = false;
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); //5min
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

export async function getDownloadFilesTotalSize() {
    try {
        let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
        let filesPromise = dir.map(file => fs.promises.stat(path.join('.', 'downloadFiles', file)));
        let files = (await Promise.allSettled(filesPromise)).map(item => item.value);
        let filesTotalSize = files.reduce((acc, file) => acc + (file?.size || 0), 0) / (1024 * 1024);
        return {filesTotalSize, files, dir};
    } catch (error) {
        saveError(error);
        return {filesTotalSize: 0, files: [], dir: ''};
    }
}

export async function removeFile(fileName, newFileStatus = false) {
    try {
        let status = getServerStatusFlags();

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
        let status = getServerStatusFlags();

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
        let freeDiskSpace = await getDiskStatus(downloadingFilesSize).free;
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
    let status = getServerStatusFlags();

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
    let status = getServerStatusFlags();

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
    let status = getServerStatusFlags();

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
    let status = getServerStatusFlags();

    let fileData = status.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.endUpload = onError ? 0 : new Date();
        if (fileData.isUploading) {
            fileData.isUploading = false;
            status.uploadCounter--;
        }
        fileData.uploadLink = uploadLink;
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
