import config from "../config/index.js";
import {saveCrawlerWarning} from "../db/serverAnalysisDbMethods.js";
import {saveError} from "../saveError.js";

export async function getYoutubeDownloadLink(page, url, retryCounter) {
    //https://en.savefrom.net
    try {
        if (url.includes('/embed/')) {
            url = url.split('?')[0].replace('embed/', 'watch?v=');
        }
        let pageUrl = url.replace('youtube.com', 'ssyoutube.com');

        await page.goto(pageUrl, {waitUntil: "networkidle2"});

        await page.waitForSelector('#sf_url');
        let inputForm = await page.$('#sf_form');
        let inputFormValue = await inputForm.evaluate(el => el.textContent);
        if (!inputFormValue.includes(url)) {
            await page.$eval('#sf_url', (el, url) => el.value = url, url);
            let button = await page.$('#sf_submit');
            await button.click();
        }

        await Promise.any([
            page.waitForSelector('.result-failure', {visible: true}),
            page.waitForSelector('.link-download'),
        ]);

        let link = await page.$('.link-download');
        if (!link) {
            retryCounter++;
            return await getYoutubeDownloadLink2(page, url, retryCounter);
        }

        return {
            youtubeUrl: url,
            downloadUrl: await link.evaluate(el => el.href),
            cookies: await page.cookies(),
        };
    } catch (error) {
        if (error.message && error.message.match(/((timeout)|(Waiting failed:)|(Waiting for selector)) .+ exceeded/i)) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                await saveCrawlerWarning(`RemoteBrowser error on (page: ${simpleUrl}), (ErrorMessage: ${error.message}), (Method: 1), (serverName: ${config.serverName})`);
            }
        } else {
            saveError(error);
        }
        retryCounter++;
        return await getYoutubeDownloadLink2(page, url, retryCounter);
    }
}

export async function getYoutubeDownloadLink2(page, url, retryCounter) {
    //https://en.y2mate.is
    try {
        if (url.includes('/embed/')) {
            url = url.split('?')[0].replace('embed/', 'watch?v=');
        }
        let pageUrl = url.replace('youtube.com', 'youtubepi.com');

        await page.goto(pageUrl, {waitUntil: "networkidle2"});

        await Promise.any([
            page.waitForSelector('#error-text', {visible: true}),
            page.waitForSelector('.tableVideo'),
        ]);

        let convertButtons = await page.$$("table[class=tableVideo] button");
        if (convertButtons.length === 0) {
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

        await page.waitForXPath("//a[contains(. , 'Download')]");
        let links = await page.$x("//a[contains(. , 'Download')]");
        return {
            youtubeUrl: url,
            downloadUrl: await links[0].evaluate(el => el.href),
            cookies: await page.cookies(),
        };
    } catch (error) {
        if (error.message && error.message.match(/((timeout)|(Waiting failed:)|(Waiting for selector)) .+ exceeded/i)) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                await saveCrawlerWarning(`RemoteBrowser error on (page: ${simpleUrl}), (ErrorMessage: ${error.message}), (Method: 2), (serverName: ${config.serverName})`);
            }
        } else {
            saveError(error);
        }
        return null;
    }
}
