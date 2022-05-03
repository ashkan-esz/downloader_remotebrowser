import config from "./config/index.js";
import {Cluster} from "puppeteer-cluster";
import {handleSourceSpecificStuff} from "./BrowserMethods.js";
import {saveError} from "./saveError.js";

let cluster = null;

export async function executeUrl(url, retryCounter = 0) {
    try {
        let res = await cluster.execute(url);
        if (!res && retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, retryCounter);
        }
        return {res: res, retryCounter: retryCounter};
    } catch (error) {
        if (retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, retryCounter);
        }
        saveError(error);
        return {res: null, retryCounter: retryCounter};
    }
}

export async function startBrowser() {
    try {
        const tabNumber = config.browserTabsCount;
        const showManitor = (config.nodeEnv === 'dev' || config.crawlerMonitor === 'true');
        const puppeteerOptions = {
            headless: true,
            args: [
                "--no-sandbox",
                "--single-process",
                "--no-zygote"
            ]
        }
        cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: tabNumber,
            puppeteerOptions: puppeteerOptions,
            retryLimit: 2,
            workerCreationDelay: 100,
            timeout: 28000,
            monitor: showManitor,
        });

        await cluster.task(async ({page, data: url}) => {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36');
            await page.setViewport({width: 1280, height: 800});
            await page.setDefaultTimeout(40000);
            await configRequestInterception(page);
            return await handleSourceSpecificStuff(url, page);
        });
    } catch (error) {
        saveError(error);
    }
}

async function configRequestInterception(page) {
    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
        let url = interceptedRequest.url();
        if (
            url.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff|woff2|ttfwebp|json|mp4)(\?_=\d)?$/) ||
            url.match(/\.css(\?ver=((.{3,6})|\d{10}))?$/) ||
            url.includes('iframe.html') ||
            url.includes('fingerprint.html') ||
            url.startsWith('data:image/svg+xml') ||
            url.match(
                /\.(all|footer-bundle|(jquery\.ui\.position\.min)|(uikit-icons\.min))\.js$/) ||
            url.match(/\d\d\d\.js/) ||
            url.match(
                /(query|swiper|range|core|ajax|slick|select2|flatpickr|lazyload|dox|sweetalert2)\.min\.js/) ||
            url.match(
                /((bootstrap\.bundle)|(jquery\.magnific-popup)|(jquery-migrate)|(emoji-release)|(rocket-loader))\.min\.js/) ||
            url.match(/(loader|script|jwplayer|main|site-reviews)\.js/) ||
            url.includes('autoptimize') ||
            url.includes('/litespeed-cache/assets/js/') ||
            url.includes('/litespeed/js/') ||
            url.includes('/wp-content/cache/min/1/') ||
            url.includes('https://sentry') ||
            url.match(/youtube|yektanet|google|zarpop/)
        ) {
            interceptedRequest.abort();
        } else {
            interceptedRequest.continue();
        }
    });
}

export async function closeBrowser() {
    try {
        await cluster.idle();
        await cluster.close();
    } catch (error) {
        await saveError(error);
    }
}
