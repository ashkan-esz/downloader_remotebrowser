import config from "../config/index.js";
import {saveCrawlerWarning} from "../db/serverAnalysisDbMethods.js";
import {saveError} from "../saveError.js";
import {changePageLinkStateFromCrawlerStatus, removePageLinkToCrawlerStatus} from "../serverStatus.js";

export async function getYoutubeDownloadLink(page, url, retryCounter) {
    //https://en.savefrom.net
    const originalUrl = url;
    try {
        if (url.includes('/embed/')) {
            url = url.split('?')[0].replace('embed/', 'watch?v=');
        }
        let pageUrl = url.replace('youtube.com', 'ssyoutube.com');

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'goToPage', retryCounter);
        await page.goto(pageUrl, {waitUntil: "networkidle2"});

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'waitForSelector', retryCounter);
        await page.waitForSelector('#sf_url');
        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'waitForInputForm', retryCounter);
        let inputForm = await page.$('#sf_form');
        let inputFormValue = await inputForm.evaluate(el => el.textContent);
        if (!inputFormValue.includes(url)) {
            await page.$eval('#sf_url', (el, url) => el.value = url, url);
            let button = await page.$('#sf_submit');
            await button.click();
        }

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'waitForResult', retryCounter);
        await Promise.any([
            page.waitForSelector('.result-failure', {visible: true}),
            page.waitForSelector('.link-download'),
        ]);

        let link = await page.$('.link-download');
        if (!link) {
            retryCounter++;
            return await getYoutubeDownloadLink2(page, url, originalUrl, retryCounter);
        }

        removePageLinkToCrawlerStatus(originalUrl);
        return {
            youtubeUrl: url,
            downloadUrl: await link.evaluate(el => el.href),
            cookies: await page.cookies(),
        };
    } catch (error) {
        if (error.message && error.message.match(/((timeout)|(Waiting failed:)|(Waiting for selector)) .+ exceeded/i)) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                const errorMessage = error.message.split(simpleUrl)[0];
                await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): error on (page: ${simpleUrl}), (ErrorMessage: ${errorMessage}), (Method: 1)`);
            }
        } else {
            saveError(error);
        }
        retryCounter++;
        return await getYoutubeDownloadLink2(page, url, originalUrl, retryCounter);
    }
}

export async function getYoutubeDownloadLink2(page, url, originalUrl, retryCounter) {
    //https://en.y2mate.is
    try {
        if (url.includes('/embed/')) {
            url = url.split('?')[0].replace('embed/', 'watch?v=');
        }
        let pageUrl = url.replace('youtube.com', 'youtubepi.com');

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'goToPage (2)', retryCounter);
        await page.goto(pageUrl, {waitUntil: "networkidle2"});

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'waitForPageLoad (2)', retryCounter);
        await Promise.any([
            page.waitForSelector('#error-text', {visible: true}),
            page.waitForSelector('.tableVideo'),
        ]);

        changePageLinkStateFromCrawlerStatus(originalUrl, 'youtubeDownload', 'waitForResult (2)', retryCounter);
        let convertButtons = await page.$$("table[class=tableVideo] button");
        if (convertButtons.length === 0) {
            removePageLinkToCrawlerStatus(originalUrl);
            return null;
        }

        let found720 = false;
        for (let i = 0; i < convertButtons.length; i++) {
            let parent_node = await convertButtons[i].getProperty('parentNode');
            let prev = await parent_node.evaluateHandle(el => el.previousElementSibling);
            let prev2 = await prev.evaluateHandle(el => el.previousElementSibling);
            let text = await prev2.evaluate(el => el.textContent);

            if (text.toLowerCase().includes('720p')) {
                await convertButtons[i].evaluate(b => b.click());
                found720 = true;
                break;
            }
            if (text.toLowerCase().includes('480p') || text.toLowerCase().includes('360p')) {
                break;
            }
        }
        if (!found720) {
            await convertButtons[0].evaluate(b => b.click());
        }

        removePageLinkToCrawlerStatus(originalUrl);
        await page.waitForXPath("//a[contains(. , 'Download')]");
        let links = await page.$x("//a[contains(. , 'Download')]");
        return {
            youtubeUrl: url,
            downloadUrl: await links[0].evaluate(el => el.href),
            cookies: await page.cookies(),
        };
    } catch (error) {
        removePageLinkToCrawlerStatus(originalUrl);
        if (error.message && error.message.match(/((timeout)|(Waiting failed:)|(Waiting for selector)) .+ exceeded/i)) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                const errorMessage = error.message.split(simpleUrl)[0];
                await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): error on (page: ${simpleUrl}), (ErrorMessage: ${errorMessage}), (Method: 2)`);
            }
        } else {
            saveError(error);
        }
        return null;
    }
}
