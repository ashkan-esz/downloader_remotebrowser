const puppeteer = require('puppeteer');
const {saveError} = require("./saveError");

let browser = null;
let pages = [];
let pageIdCounter = 0;
let creatingPageCounter = 0;


export async function getPageObj() {
    try {
        const tabNumber = Number(process.env.CRAWLER_BROWSER_TAB_COUNT) || 3;
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].state === 'free') {
                pages[i].state = 'pending';
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
                    id: pageIdCounter
                };
                pageIdCounter++;
                pages.push(newPageObj);
            }
            creatingPageCounter--;
            return newPageObj;
        } else {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 100));
                for (let i = 0; i < pages.length; i++) {
                    if (pages[i].state === 'free') {
                        pages[i].state = 'pending';
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

export function setPageFree(id) {
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].id === id) {
            pages[i].state = 'free';
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
        // await configRequestInterception(page);
        return page;
    } catch (error) {
        saveError(error);
        return null;
    }
}

async function configRequestInterception(page) {
    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
        if (
            interceptedRequest.url().endsWith('.png') ||
            interceptedRequest.url().endsWith('.jpg') ||
            interceptedRequest.url().endsWith('.jpeg') ||
            interceptedRequest.url().endsWith('.gif') ||
            interceptedRequest.url().endsWith('.svg') ||
            interceptedRequest.url().endsWith('.ico') ||
            interceptedRequest.url().endsWith('.woff') ||
            interceptedRequest.url().endsWith('.woff2') ||
            interceptedRequest.url().endsWith('.ttf') ||
            interceptedRequest.url().endsWith('.css') ||
            interceptedRequest.url().endsWith('.webp') ||
            interceptedRequest.url().endsWith('.json') ||
            interceptedRequest.url().endsWith('.mp4') ||
            interceptedRequest.url().endsWith('all.js') ||
            interceptedRequest.url().endsWith('footer-bundle.js') ||
            interceptedRequest.url().endsWith('jquery.ui.position.min.js') ||
            interceptedRequest.url().endsWith('uikit-icons.min.js') ||
            interceptedRequest.url().includes('query.min.js') ||
            interceptedRequest.url().includes('bootstrap.bundle.min.js') ||
            interceptedRequest.url().includes('swiper.min.js') ||
            interceptedRequest.url().includes('select2.min.js') ||
            interceptedRequest.url().includes('flatpickr.min.js') ||
            interceptedRequest.url().includes('slick.min.js') ||
            interceptedRequest.url().includes('sweetalert2.min.js') ||
            interceptedRequest.url().includes('site-reviews.js') ||
            interceptedRequest.url().includes('range.js') ||
            interceptedRequest.url().includes('jquery.magnific-popup.min.js') ||
            interceptedRequest.url().includes('jquery-migrate.min.js') ||
            interceptedRequest.url().includes('ajax.js') ||
            interceptedRequest.url().includes('core.min.js') ||
            interceptedRequest.url().includes('script.js') ||
            interceptedRequest.url().includes('youtube') ||
            interceptedRequest.url().includes('yektanet') ||
            interceptedRequest.url().includes('google') ||
            interceptedRequest.url().includes('zarpop')
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
