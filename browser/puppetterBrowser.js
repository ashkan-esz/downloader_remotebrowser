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

export async function executeUrl(url, cookieOnly, retryCounter = 0) {
    try {
        let res = await cluster.execute({url, cookieOnly});
        if (!res && retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, cookieOnly, retryCounter);
        }
        return {res: res, retryCounter: retryCounter};
    } catch (error) {
        if (retryCounter < 1) {
            retryCounter++;
            await new Promise(resolve => setTimeout(resolve, 500));
            return await executeUrl(url, cookieOnly, retryCounter);
        }
        error.url = url;
        saveError(error, true);
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
            puppeteer: puppeteer,
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: tabNumber,
            puppeteerOptions: puppeteerOptions,
            retryLimit: 1,
            workerCreationDelay: 100,
            timeout: 28000,
            monitor: showManitor,
        });

        await cluster.task(async ({page, data: {url, cookieOnly}}) => {
            const fingerprintWithHeaders = fingerprintGenerator.getFingerprint();
            await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprintWithHeaders);
            await page.setViewport({width: 1280, height: 800});
            await page.setDefaultTimeout(40000);
            await configRequestInterception(page);
            return await handleSourceSpecificStuff(url, page, cookieOnly);
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
