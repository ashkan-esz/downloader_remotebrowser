import config from "../config/index.js";
import {executeUrl} from "./puppetterBrowser.js";
import {saveError} from "../saveError.js";
import {saveCrawlerWarning} from "../db/serverAnalysisDbMethods.js";
import {
    addPageLinkToCrawlerStatus,
    changePageLinkStateFromCrawlerStatus,
    removePageLinkToCrawlerStatus
} from "../serverStatus.js";


export async function getPageData(url, cookieOnly) {
    let pageData = {
        pageContent: null,
        cookies: {},
        responseUrl: '',
        retryCount: 0,
        pageTitle: '',
    }
    addPageLinkToCrawlerStatus(url);
    let execResult = await executeUrl(url, cookieOnly);
    removePageLinkToCrawlerStatus(url);
    pageData.retryCount = execResult.retryCounter;
    if (execResult.res) {
        pageData = {...pageData, ...execResult.res};
    }
    return pageData;
}

export async function handleSourceSpecificStuff(url, page, cookieOnly, retryCounter) {
    let pageLoaded = await loadPage(url, page, retryCounter);
    if (!pageLoaded) {
        return null;
    }

    return {
        pageContent: cookieOnly ? null : await page.content(),
        cookies: await page.cookies(),
        responseUrl: page.url(),
        pageTitle: await page.title(),
    };
}

async function loadPage(url, page, retryCounter) {
    //goto page url
    const originalUrl = url;
    try {
        changePageLinkStateFromCrawlerStatus(originalUrl, 'crawler', 'waitForPageLoad', retryCounter);
        if (url.includes('digimovie')) {
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

        if ((await page.content()).includes('در ﺣﺎل اﻧﺘﻘﺎل ﺑﻪ ﺳﺎﯾﺖ ﻣﻮرد ﻧﻈﺮ ﻫﺴﺘﯿﺪ...')) {
            await page.waitForNavigation({timeout: 10000});
        }

    } catch (error) {
        if (error.message && (
            error.message.match(/timeout .+ exceeded/i) ||
            error.message.includes('net::ERR_TIMED_OUT') ||
            error.message.includes('net::ERR_CONNECTION_TIMED_OUT') ||
            error.message.includes('net::ERR_DNS_NO_MATCHING_SUPPORTED_ALPN')
        )) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                const errorMessage = error.message.split('http')[0].replace(/\sat$/, '').trim();
                await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): error on (page: ${simpleUrl}), (ErrorMessage: ${errorMessage})`);
            }
        } else {
            error.url = url;
            saveError(error, true);
        }
        return false;
    }

    //wait for page load complete
    try {
        changePageLinkStateFromCrawlerStatus(originalUrl, 'crawler', 'waitForPageLoadCompletely', retryCounter);
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
        if (error.message && error.message.match(/((timeout)|(Waiting failed:)|(Waiting for selector)) .+ exceeded/i)) {
            if (retryCounter === 0) {
                const simpleUrl = url.replace('https://', '').split('/')[0];
                const errorMessage = error.message.split('http')[0];
                await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): error on (page: ${simpleUrl}), (ErrorMessage: ${errorMessage})`);
            }
        } else if (error.message === 'All promises were rejected') {
            const simpleUrl = url.replace('https://', '').split('/')[0];
            const errorMessage = "Waiting for selector `.main_site/.body_favorites` failed: Waiting failed: 10000ms exceeded";
            await saveCrawlerWarning(`RemoteBrowser (${config.serverName}): error on (page: ${simpleUrl}), (ErrorMessage: ${errorMessage})`);
        } else {
            saveError(error);
        }
        return false;
    }
}
