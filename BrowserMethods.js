import {executeUrl} from "./puppetterBrowser.js";
import {loginAnimeList, uploadAnimeListSubtitles, handleAnimeListCaptcha} from "./sources/animelist.js";
import {saveError} from "./saveError.js";

export async function getPageData(url) {
    let pageData = {
        pageContent: null,
        cookies: {},
        responseUrl: '',
        subtitles: [],
        retryCount: 0,
    }
    let execResult = await executeUrl(url);
    pageData.retryCount = execResult.retryCounter;
    if (execResult.res) {
        pageData = {...pageData, ...execResult.res};
    }
    return pageData;
}

export async function handleSourceSpecificStuff(url, page) {
    let isAnimeList = url.match(/anime-?list/i);
    let pageLoaded = await loadPage(url, isAnimeList, page);
    if (!pageLoaded) {
        return null;
    }
    let subtitles = [];
    if (isAnimeList && url.includes('/anime/')) {
        let captchaResult = await handleAnimeListCaptcha(page);
        if (!captchaResult) {
            return null;
        }
        subtitles = await uploadAnimeListSubtitles(page);
    }
    return {
        pageContent: await page.content(),
        cookies: await page.cookies(),
        responseUrl: page.url(),
        subtitles: subtitles,
    };
}

async function loadPage(url, isAnimelist, page) {
    try {
        if (isAnimelist) {
            await page.goto(url, {waitUntil: "domcontentloaded"});
            await loginAnimeList(page);
        } else {
            await page.goto(url);
        }

        if (url.includes('digimovie')) {
            await page.waitForSelector('.container', {timeout: 15000});
            if (url.match(/\/serie$|\/page\//g) || url.replace('https://', '').split('/').length === 1) {
                await page.waitForSelector('.main_site', {timeout: 15000});
                await page.waitForSelector('.alphapageNavi', {timeout: 15000});
            }
        }

        return true;
    } catch (error) {
        saveError(error);
        return false;
    }
}
