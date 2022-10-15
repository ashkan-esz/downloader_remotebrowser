import config from "../config/index.js";
import {Cluster} from "puppeteer-cluster";
import * as originalPuppeteer from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import {handleSourceSpecificStuff} from "./BrowserMethods.js";
import {saveError} from "../saveError.js";
import {FingerprintGenerator} from "fingerprint-generator";
import {FingerprintInjector} from "fingerprint-injector";
import {uploadFileToBlackHole} from "../sources/blackHole.js";
import {getYoutubeDownloadLink} from "../sources/youtube.js";

puppeteer.use(StealthPlugin());
puppeteer.use(
    AdblockerPlugin({
        // Optionally enable Cooperative Mode for several request interceptors
        interceptResolutionPriority: originalPuppeteer.DEFAULT_INTERCEPT_RESOLUTION_PRIORITY
    })
);

const fingerprintInjector = new FingerprintInjector();
const fingerprintGenerator = new FingerprintGenerator({
    browsers: [
        {name: 'firefox', minVersion: 81},
        {name: 'chrome', minVersion: 88}
    ],
    devices: ['desktop'],
    operatingSystems: ['windows', 'linux'],
});

let cluster = null;
let browserPid = 0;

export function getBrowserPid() {
    return browserPid;
}

export async function executeUrl(url, cookieOnly, fileNames = [], saveToDb = false, execType = '', retryCounter = 0) {
    try {
        let res = await cluster.execute({url, cookieOnly, fileNames, saveToDb, execType});
        if (!res && retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, cookieOnly, fileNames, saveToDb, execType, retryCounter);
        }
        return {res: res, retryCounter: retryCounter};
    } catch (error) {
        if (retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, cookieOnly, fileNames, saveToDb, execType, retryCounter);
        }
        error.url = url;
        saveError(error, true);
        return {res: null, retryCounter: retryCounter};
    }
}

export async function startBrowser() {
    try {
        const tabNumber = config.browserTabsCount;
        const showMonitor = (config.nodeEnv === 'dev' || config.crawlerMonitor === 'true');
        const puppeteerOptions = {
            headless: true,
            args: [
                "--no-sandbox",
                "--single-process",
                "--no-zygote"
            ]
        }
        cluster = await Cluster.launch({
            puppeteer: puppeteer,
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: tabNumber,
            puppeteerOptions: puppeteerOptions,
            retryLimit: 1,
            workerCreationDelay: 100,
            timeout: 130 * 60 * 1000, //130 min
            monitor: showMonitor,
        });

        await cluster.task(async ({page, data: {url, cookieOnly, fileNames, saveToDb, execType}}) => {
            browserPid = page.browser().process().pid;

            if (url.includes('blackHole.') || fileNames.length > 0) {
                await page.browser()
                    .defaultBrowserContext()
                    .overridePermissions('https://blackhole.run', ['clipboard-read', 'clipboard-write']);
            }

            const fingerprintWithHeaders = fingerprintGenerator.getFingerprint();
            await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprintWithHeaders);
            await page.setViewport({width: 1280, height: 800});
            await configRequestInterception(page, execType);
            if (url.includes('blackHole.') || fileNames.length > 0) {
                await page.setDefaultTimeout(60000);
                return await uploadFileToBlackHole(page, fileNames, saveToDb);
            } else if (execType === 'downloadYoutube') {
                await page.setDefaultTimeout(40000);
                return await getYoutubeDownloadLink(page, url);
            }
            await page.setDefaultTimeout(40000);
            return await handleSourceSpecificStuff(url, page, cookieOnly);
        });
    } catch (error) {
        saveError(error);
    }
}

async function configRequestInterception(page, execType) {
    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
        let url = interceptedRequest.url();

        if (execType === 'downloadYoutube' && url.includes('.js')) {
            if (
                url.includes('chunk-') ||
                url.includes('video.min') ||
                url.includes('sfHelper') ||
                url.includes('lang_selector') ||
                url.includes('assetsSfMain') ||
                url.includes('mainFormOutput') ||
                url.includes('experimentLoader')
            ) {
                interceptedRequest.abort();
            } else {
                interceptedRequest.continue();
            }
            return;
        }

        if (
            url.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff|woff2|ttfwebp|json|mp3|mp3ds|mp4)(\?_=\d)?$/) ||
            url.match(/\.css(\?ver=((.{3,6})|\d{10}))?$/) ||
            url.includes('iframe.html') ||
            url.includes('fingerprint.html') ||
            url.startsWith('data:image/') ||
            url.startsWith('data:text/') ||
            url.match(
                /[.\/](all|spf|network|www-tampering)\.js$/) ||
            url.match(
                /[.\/](footer-bundle|(jquery\.ui\.position\.min)|(uikit-icons\.min)|(desktop_polymer))\.js$/) ||
            url.match(
                /[.\/]((custom-elements-es5-adapter)|(webcomponents-sd)|(scheduler)|(www-i18n-constants))\.js$/) ||
            url.match(/\d\d\d\.js/) ||
            url.match(
                /(query|swiper|range|core|ajax|slick|select2|flatpickr|lazyload|dox|sweetalert2|mouse|slider|vimeo)\.min\.js/) ||
            url.match(
                /((bootstrap\.bundle)|(jquery\.magnific-popup)|(jquery-migrate)|(emoji-release)|(rocket-loader))\.min\.js/) ||
            url.match(
                /((web-animations-next-lite)|(intersection-observer)|(comment-reply)|(email-decode)|(jquery-\d+(\.\d+)*))\.min\.js/) ||
            url.match(
                /(mediaelement(-.+)*)\.min\.js/) ||
            url.match(/(loader|script|jwplayer|main|site-reviews|invisible)\.js/) ||
            url.includes('autoptimize') ||
            url.includes('/litespeed-cache/assets/js/') ||
            url.includes('/litespeed/js/') ||
            url.includes('/wp-content/cache/min/1/') ||
            url.includes('https://sentry') ||
            url.match(/yektanet|google|zarpop/)
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
