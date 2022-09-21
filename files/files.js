import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import * as stream from 'stream';
import {promisify} from 'util';
import nou from 'node-os-utils';
import checkDiskSpace from 'check-disk-space';
import {saveError} from "../saveError.js";
import axios from "axios";
import {executeUrl} from "../browser/puppetterBrowser.js";

const promisifiedFinished = promisify(stream.finished);

const uploadAndDownloadStatus = {
    uploadAndDownloadFiles: [],
    downloadCounter: 0,
    uploadCounter: 0,
}

try {
    await fs.promises.mkdir(path.join('.', 'downloadFiles'));
} catch (error) {
}

try {
    let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
    let filesPromise = dir.map(file => fs.promises.stat(path.join('.', 'downloadFiles', file)));
    let files = (await Promise.allSettled(filesPromise)).map(item => item.value);
    for (let i = 0; i < dir.length; i++) {
        if (!uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === dir[i])) {
            uploadAndDownloadStatus.uploadAndDownloadFiles.push({
                fileName: dir[i],
                size: (files[i]?.size || 0) / (1024 * 1024),
                startDownload: '',
                endDownload: '',
                downloadLink: '',
                isDownloading: false,
                startUpload: '',
                endUpload: '',
                uploadLink: '',
                isUploading: false,
            });
        }
    }
} catch (error) {
}

export function getUploadAndDownloadStatus() {
    return uploadAndDownloadStatus;
}

export async function getFilesStatus() {
    try {
        let dir = await fs.promises.readdir(path.join('.', 'downloadFiles'));
        let filesPromise = dir.map(file => fs.promises.stat(path.join('.', 'downloadFiles', file)));
        let files = (await Promise.allSettled(filesPromise)).map(item => item.value);

        const __filename = fileURLToPath(import.meta.url);
        let disStatus = await checkDiskSpace('/' + (__filename.split('/')[1] || ''));
        let memoryStatus = await nou.mem.info();

        let result = {
            files: dir.map((fileName, index) => {
                let temp = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
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
            filesTotalSize: files.reduce((acc, file) => acc + (file?.size || 0), 0) / (1024 * 1024), //mb
            disStatus: {
                diskPath: disStatus.diskPath,
                total: disStatus.size / (1024 * 1024),
                used: (disStatus.size - disStatus.free) / (1024 * 1024),
                free: disStatus.free / (1024 * 1024),
            },
            memoryStatus: {
                total: memoryStatus.totalMemMb,
                used: memoryStatus.usedMemMb,
                free: memoryStatus.freeMemMb,
            },
        }

        return result;
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function removeFile(fileName, newFileStatus = false) {
    try {
        let fileData = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
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
            uploadAndDownloadStatus.uploadAndDownloadFiles = uploadAndDownloadStatus.uploadAndDownloadFiles
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

export async function downloadFile(downloadLink, alsoUploadFile = false) {
    try {
        let memoryStatus = await nou.mem.info();
        if (memoryStatus.freeMemMb <= 50) {
            return {
                fileData: null,
                message: `Low memory (${memoryStatus.freeMemMb}MB)`,
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

        let checkFile = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
        if (checkFile) {
            if (checkFile.isDownloading) {
                return {
                    fileData: null,
                    message: 'File is downloading',
                };
            }
            if (checkFile.size === fileSize) {
                checkFile.downloadLink = downloadLink;
                if (alsoUploadFile) {
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

        const __filename = fileURLToPath(import.meta.url);
        let disStatus = await checkDiskSpace('/' + (__filename.split('/')[1] || ''));
        let freeDiskSpace = disStatus.free / (1024 * 1024);

        let downloadingFilesSize = uploadAndDownloadStatus.uploadAndDownloadFiles
            .filter(item => item.isDownloading)
            .reduce((acc, file) => acc + file.size, 0);
        if (downloadingFilesSize + fileSize > (freeDiskSpace - 20)) {
            return {
                fileData: null,
                message: `Low disk space (${freeDiskSpace}MB vs ${fileSize}MB)`,
            };
        }

        const writeStream = fs.createWriteStream(path.join('.', 'downloadFiles', fileName));
        response.data.pipe(writeStream);
        addNewDownloadingFile(fileName, fileSize, downloadLink, startTime);
        await promisifiedFinished(writeStream); //this is a Promise
        let fileData = fileDownloadEnd(fileName);

        if (alsoUploadFile) {
            await uploadFiles([fileName]);
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

export async function uploadFiles(fileNames) {
    return await executeUrl('', false, fileNames);
}

//-------------------------------------------------
//-------------------------------------------------

function addNewDownloadingFile(fileName, fileSize, downloadLink, startTime) {
    uploadAndDownloadStatus.uploadAndDownloadFiles.push({
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
    });
    uploadAndDownloadStatus.downloadCounter++;
}

function fileDownloadEnd(fileName) {
    let fileData = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.endDownload = new Date();
        fileData.isDownloading = false;
        uploadAndDownloadStatus.downloadCounter--;
    }
    return fileData;
}

export function uploadFileStart(fileName) {
    let fileData = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.startUpload = new Date();
        fileData.isUploading = false;
        uploadAndDownloadStatus.uploadCounter++;
    }
    return fileData;
}

export async function uploadFileEnd(fileName, uploadLink) {
    let fileData = uploadAndDownloadStatus.uploadAndDownloadFiles.find(item => item.fileName === fileName);
    if (fileData) {
        fileData.endUpload = new Date();
        fileData.isUploading = false;
        fileData.uploadLink = uploadLink;
        uploadAndDownloadStatus.uploadCounter--;
        await fs.promises.unlink(path.join('.', 'downloadFiles', fileName));
        uploadAndDownloadStatus.uploadAndDownloadFiles = uploadAndDownloadStatus.uploadAndDownloadFiles
            .filter(item => item.fileName !== fileName);
    }
    return fileData;
}
