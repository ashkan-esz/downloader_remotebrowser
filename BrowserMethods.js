import {executeUrl} from "./puppetterBrowser.js";
import {loginAnimeList, handleAnimeListCaptcha} from "./sources/animelist.js";
import {saveError} from "./saveError.js";

export async function getPageData(url, cookieOnly) {
    let pageData = {
        pageContent: null,
        cookies: {},
        responseUrl: '',
        retryCount: 0,
    }
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
