import {executeUrl} from "./puppetterBrowser.js";
import {loginAnimeList, handleAnimeListCaptcha} from "../sources/animelist.js";
import {saveError} from "../saveError.js";
import {newCrawlerCall} from "../files/files.js";

let browserStatus = {
    digimovieTimeoutErrorTime: 0,
};

export async function getPageData(url, cookieOnly) {
    let pageData = {
        pageContent: null,
        cookies: {},
        responseUrl: '',
        retryCount: 0,
        pageTitle: '',
    }
    newCrawlerCall();
    let execResult = await executeUrl(url, cookieOnly);
    pageData.retryCount = execResult.retryCounter;
    if (execResult.res) {
        pageData = {...pageData, ...execResult.res};
    }
    return pageData;
}

export async function handleSourceSpecificStuff(url, page, cookieOnly) {
    let isAnimeList = url.match(/anime-?list/i);
    let pageLoaded = await loadPage(url, isAnimeList, page);
    if (!pageLoaded) {
        return null;
    }

    if (isAnimeList && url.includes('/anime/')) {
        let captchaResult = await handleAnimeListCaptcha(page);
        if (!captchaResult) {
            return null;
        }
    }

    return {
        pageContent: cookieOnly ? null : await page.content(),
        cookies: await page.cookies(),
        responseUrl: page.url(),
        pageTitle: await page.title(),
    };
}

async function loadPage(url, isAnimelist, page) {
    try {
        if (isAnimelist) {
            await page.goto(url, {waitUntil: "domcontentloaded"});
            await loginAnimeList(page);
        } else if (url.includes('digimovie')) {
            if (!url.match(/\/$/)) {
                url = url + '/';
            }
            await page.goto(url, {waitUntil: "domcontentloaded"});
        } else if (url.includes('avamovie')) {
            await page.goto(url, {waitUntil: "networkidle0"});
            await page.waitForSelector('.siteHeader', {timeout: 20000});
        } else {
            await page.goto(url);
        }
    } catch (error) {
        error.url = url;
        saveError(error, true);
        return false;
    }

    try {
        if (url.includes('digimovie')) {
            await page.waitForSelector('.container', {timeout: 10000});
            if (url.match(/\/series?$|\/page\//g) || url.replace('https://', '').split('/').length === 1) {
                await Promise.any([
                    page.waitForSelector('.main_site', {timeout: 10000}),
                    page.waitForSelector('.body_favorites', {timeout: 10000})
                ]);
                await page.waitForSelector('.alphapageNavi', {timeout: 10000});
            }
        }
        return true;
    } catch (error) {
        if (error.message && (error.message.match(/timeout .+ exceeded/) || error.message === 'All promises were rejected')) {
            if (Date.now() - browserStatus.digimovieTimeoutErrorTime > 10 * 60 * 1000) {  //10min
                browserStatus.digimovieTimeoutErrorTime = Date.now();
                error.url = url;
                saveError(error, true);
            }
        } else {
            saveError(error);
        }
        return false;
    }
}
