import config from "../config/index.js";
import path from "path";
import {uploadFileEnd, uploadFileStart} from "../files/files.js";
import {
    changePageLinkStateFromCrawlerStatus,
    getFilesStatus,
    getMemoryStatus,
    getServerStatusFlags, removePageLinkToCrawlerStatus,
    updateBlackHoleUploadMessage
} from "../serverStatus.js";
import {saveError} from "../saveError.js";


export async function uploadFileToBlackHole(page, fileNames, saveToDb, retryCounter) {
    let uploadedFilesData = [];
    try {
        changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'checkUploadIsPossible', retryCounter);
        let checkPossible = await checkUploadIsPossible(fileNames);
        if (checkPossible !== 'ok') {
            return checkPossible;
        }

        changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'checkUploadIsPossible', retryCounter);
        await loginToBlackHole(page);

        let status = getServerStatusFlags();
        for (let i = 0; i < fileNames.length; i++) {
            changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'waitForPrevUploadComplete', retryCounter);
            while (status.uploadCounter >= 1) {
                await new Promise(resolve => setTimeout(resolve, 60 * 1000)); //1 min
            }

            changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'choosingFile', retryCounter);
            await page.waitForSelector('input[id=file]', {visible: true});
            const inputUploadHandle = await page.$('input[id=file]');
            let fileToUpload = path.join('.', 'downloadFiles', fileNames[i]);
            await inputUploadHandle.uploadFile(fileToUpload);
            changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'uploadFileStart', retryCounter);
            let fileData = await uploadFileStart(fileNames[i], saveToDb);

            await new Promise(async (resolve, reject) => {
                let intervalId
                try {
                    const uploadProgress = {
                        time: 0,
                        text: '',
                    };

                    intervalId = setInterval(async () => {
                        let progressbar = await page.$('.progressbar');
                        let prev = await progressbar.evaluateHandle(el => el.previousElementSibling);
                        let text = await prev.evaluate(el => el.textContent);
                        fileData.uploadProgress = text;

                        if (Date.now() - uploadProgress.time >= 2 * 60 * 1000) {
                            if (text === uploadProgress.text && uploadProgress.time && text.toLowerCase().includes('uploading')) {
                                updateBlackHoleUploadMessage('', 0, 'error');
                                changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'uploadFileStart --stopped', retryCounter);
                                return reject("upload progress stopped");
                            } else {
                                uploadProgress.time = Date.now();
                                uploadProgress.text = text;
                                updateBlackHoleUploadMessage(text, Date.now(), 'active');
                                changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'uploadFileStart --' + text, retryCounter);
                            }
                        }
                    }, 3000);

                    await page.waitForFunction(
                        text => document.querySelector(".media-content").innerText.includes(text),
                        {timeout: (fileData.size + 1) * 60 * 1000}, //1MB per min
                        "Add your file to start uploading"
                    );

                    clearInterval(intervalId);
                    updateBlackHoleUploadMessage('', 0, 'done');
                    resolve("ok");
                } catch (error2) {
                    removePageLinkToCrawlerStatus('');
                    saveError(error2);
                    clearInterval(intervalId);
                    reject(error2);
                }
            });

            changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'copyLinkToClipboard', retryCounter);
            await page.waitForSelector("#copyToClipboard");
            let copyLinkButton = await page.$("#copyToClipboard");
            await copyLinkButton.click();
            let copyLinkButton2 = await page.$x("//button[contains(. , 'Copy link')]");
            await copyLinkButton2[1].evaluate(b => b.click());
            let uploadLink = await page.evaluate(() => navigator.clipboard.readText());
            changePageLinkStateFromCrawlerStatus('', 'blackHoleUpload', 'copyLinkToClipboard --end', retryCounter);
            await uploadFileEnd(fileNames[i], uploadLink, saveToDb);
            uploadedFilesData.push(fileData);
        }

        removePageLinkToCrawlerStatus('');
        return {
            message: "ok",
            uploadResults: uploadedFilesData,
        };
    } catch (error) {
        saveError(error);
        for (let i = 0; i < fileNames.length; i++) {
            await uploadFileEnd(fileNames[i], '', saveToDb, true);
        }
        removePageLinkToCrawlerStatus('');
        return {
            message: "Internal server error",
            uploadResults: uploadedFilesData,
        };
    }
}

export async function loginToBlackHole(page) {
    let blackHolePass = config.blackHole.password;
    let url = 'https://blackhole.run/web';
    await page.goto(url, {waitUntil: "networkidle0"});
    if (page.url() === url) {
        //already login
        return;
    }
    await page.waitForSelector('.signup-button');
    let loginButton = await page.$(".signup-button");
    await loginButton.click();

    await page.waitForSelector("pierce/.link");
    let signInButton = await page.$$("pierce/.link", {pierce: true});
    await signInButton[0].click();

    const newPage = await new Promise(x => page.once('popup', x));

    await newPage.waitForNavigation({waitUntil: "networkidle0"});
    await newPage.waitForSelector("textarea", {visible: true});
    await newPage.type('textarea', blackHolePass);
    await Promise.all([
        newPage.click('button[type=submit]'),
        newPage.waitForNavigation({waitUntil: "networkidle0"})
    ]);
    let temp = await newPage.$$('span');
    for (let i = 0; i < temp.length; i++) {
        let value = await temp[i].evaluate(el => el.textContent)
        if (value && value.length > 25 && value.match(/^[a-zA-Z\d]+$/)) {
            await temp[i].click();
            break;
        }
    }

    await page.waitForNavigation({waitUntil: "networkidle0"});
    await Promise.all([
        page.click(".accept-btn"),
        page.waitForNavigation({waitUntil: "networkidle0"}),
    ]);
}

async function checkUploadIsPossible(fileNames) {
    if (!config.blackHole.password) {
        return {
            message: "BlackHole password not provided",
            uploadResults: [],
        };
    }

    let filesStatus = await getFilesStatus();
    let memoryStatus = await getMemoryStatus();
    if (memoryStatus.free < 50) {
        return {
            message: `Low memory (${memoryStatus.free}MB)`,
            uploadResults: [],
        };
    }

    for (let i = 0; i < fileNames.length; i++) {
        let fileData = filesStatus.files.find(item => item.fileName === fileNames[i]);
        if (!fileData) {
            return {
                message: `Cannot find file (${fileNames[i]}), try downloading it first`,
                uploadResults: [],
            };
        }
        if (fileData.isUploading) {
            return {
                message: `File (${fileNames[i]}) is already uploading`,
                uploadResults: [],
            };
        }
        if (fileData.size > config.blackHole.fileSizeLimit) {
            return {
                message: `BlackHole upload file limit exceeded, ${fileData.size} >> ${config.blackHole.fileSizeLimit}`,
                uploadResults: [],
            };
        }
    }
    return 'ok';
}
