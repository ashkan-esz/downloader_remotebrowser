import config from "./config/index.js";
import puppeteer from "puppeteer";
import {saveError} from "./saveError.js";

let browser = null;
let pages = [];
let pageIdCounter = 0;
let creatingPageCounter = 0;


export async function getPageObj() {
    try {
        const tabNumber = config.browserTabsCount;
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].state === 'free') {
                pages[i].state = 'pending';
                pages[i].used++;
                pages[i].useTime = new Date();
                return pages[i];
            }
        }

        if (pages.length + creatingPageCounter < tabNumber) {
            creatingPageCounter++;
            let newPage = await openNewPage();
            let newPageObj = null;
            if (newPage) {
                newPageObj = {
                    page: newPage,
                    state: 'pending',
                    id: pageIdCounter,
                    used: 1,
                    useTime: new Date(),
                };
                pageIdCounter++;
                pages.push(newPageObj);
            }
            creatingPageCounter--;
            return newPageObj;
        } else {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 200));
                let now = new Date();
                for (let i = 0; i < pages.length; i++) {
                    let timeElapsed = (now.getTime() - pages[i].useTime.getTime()) / 1000;
                    if (pages[i].state === 'free' || timeElapsed > 28) {
                        pages[i].state = 'pending';
                        pages[i].used++;
                        pages[i].useTime = new Date();
                        return pages[i];
                    }
                }
            }
        }
    } catch (error) {
        saveError(error);
        return null;
    }
}

export async function setPageFree(id) {
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].id === id) {
            if (pages[i].used > 25) {
                await closePage(id);
            } else {
                pages[i].state = 'free';
            }
        }
    }
}

async function openNewPage() {
    try {
        if (!browser || !browser.isConnected()) {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    "--no-sandbox",
                    "--single-process",
                    "--no-zygote"
                ]
            });
        }
        let page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36');
        await page.setViewport({width: 1280, height: 800});
        await page.setDefaultTimeout(40000);
        await configRequestInterception(page);
        return page;
    } catch (error) {
        saveError(error);
        return null;
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

export async function closePage(id) {
    let selectedPage = null;
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].id === id) {
            selectedPage = pages[i];
        }
    }
    if (selectedPage) {
        pages = pages.filter(item => item.id !== id);
        await selectedPage.page.close();
    }
}

export async function closeBrowser() {
    try {
        if (browser && browser.isConnected()) {
            await browser.close();
        }
        browser = null;
        pages = [];
        pageIdCounter = 0;
    } catch (error) {
        await saveError(error);
    }
}
