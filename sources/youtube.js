import {saveError} from "../saveError.js";

export async function getYoutubeDownloadLink(page, url) {
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

        await page.waitForSelector('.link-download');
        let link = await page.$('.link-download');
        return {
            youtubeUrl: url,
            downloadUrl: await link.evaluate(el => el.href),
        };
    } catch (error) {
        saveError(error);
        return await getYoutubeDownloadLink2(page, url);
    }
}

export async function getYoutubeDownloadLink2(page, url) {
    //https://en.y2mate.is
    try {
        if (url.includes('/embed/')) {
            url = url.split('?')[0].replace('embed/', 'watch?v=');
        }
        let pageUrl = url.replace('youtube.com', 'youtubepi.com');

        await page.goto(pageUrl, {waitUntil: "networkidle2"});

        await page.waitForSelector('.tableVideo');

        let convertButtons = await page.$$("table[class=tableVideo] button");
        await convertButtons[0].evaluate(b => b.click());

        await page.waitForXPath("//a[contains(. , 'Download')]");
        let links = await page.$x("//a[contains(. , 'Download')]");
        return {
            youtubeUrl: url,
            downloadUrl: await links[0].evaluate(el => el.href),
        };
    } catch (error) {
        saveError(error);
        return null;
    }
}
