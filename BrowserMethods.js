import config from "./config/index.js";
import axios from "axios";
import axiosRetry from "axios-retry";
import * as cheerio from 'cheerio';
import {createWorker} from "tesseract.js";
import FormData from "form-data";
import {saveError} from "./saveError.js";
import {executeUrl} from "./puppetterBrowser.js";

axiosRetry(axios, {
    retries: 3, // number of retries
    retryDelay: (retryCount) => {
        return retryCount * 1000; // time interval between retries
    },
    retryCondition: (error) => (
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        (error.response &&
            error.response.status < 500 &&
            error.response.status !== 429 &&
            error.response.status !== 404 &&
            error.response.status !== 403)
    ),
});

let tesseractCounter = 0;

export async function getPageData(url) {
    let pageData = {
        pageContent: null,
        cookies: {},
        responseUrl: '',
        subtitles: [],
        error: false,
        message: 'ok',
    }
    //todo : generate service result here
    let execResult = await executeUrl(url);
    if (execResult) {
        pageData = {...pageData, ...execResult};
    }
    return pageData;
}

export async function handleSourceSpecificStuff(url, page) {
    let isAnimelist = url.includes('anime-list') || url.includes('animelist');
    let pageLoaded = await loadPage(url, isAnimelist, page);
    if (!pageLoaded) {
        return null;
    }
    let subtitles = [];
    if (isAnimelist && url.includes('/anime/')) {
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

async function loginAnimeList(page) {
    let email = config.animelistEmail;
    let password = config.animelistPassword;
    let loginButton = await page.$x("//a[contains(., 'ورود و ثبت نام')]");
    if (loginButton.length === 0) {
        return;
    }
    await Promise.all([
        loginButton[0].click(),
        page.waitForNavigation()
    ]);
    await page.$eval('input[name=email]', (el, email) => el.value = email, email);
    await page.$eval('input[name=password]', (el, password) => el.value = password, password);
    await Promise.all([
        page.click('.login__sign-in'),
        page.waitForNavigation({waitUntil: "domcontentloaded"}),
    ]);
}

async function uploadAnimeListSubtitles(page) {
    try {
        let pageContent = await page.content();
        let $ = cheerio.load(pageContent);
        let links = $('a');
        let subtitles = [];
        for (let i = 0; i < links.length; i++) {
            let href = $(links[i]).attr('href');
            if (href && href.includes('/sub/download/')) {
                let dedicated = true;
                let linkInfo = $($(links[i]).prev().prev()).attr('title');
                if (!linkInfo) {
                    let infoNode = $(links[i]).parent().parent().prev();
                    if (infoNode.hasClass('subs-send-links')) {
                        dedicated = false;
                        linkInfo = $(infoNode).attr('title');
                    }
                }
                let translator = $($(links[i]).parent().next().children()[1]).text().replace('توسط', '').trim();
                let episode = $($(links[i]).children()[1]).text()
                    .replace('تا', ' ')
                    .replace(/\s\s+/g, ' ')
                    .trim()
                    .replace(' ', '-');

                let subtitle = {
                    originalUrl: href,
                    sourceName: 'animelist',
                    dedicated: dedicated,
                    translator: translator,
                    info: linkInfo || '',
                    episode: episode,
                    type: 'direct',
                    fileName: '',
                    urlData: null,
                    insertData: new Date(),
                }
                subtitles.push(subtitle);
            }
        }
        return subtitles;
    } catch (error) {
        saveError(error);
        return [];
    }
}

async function handleAnimeListCaptcha(page) {
    try {
        let captchaImage = await page.evaluate('document.querySelector("#captcha").getAttribute("src")');
        captchaImage = captchaImage.split(';base64,').pop();
        let captchaCode = '';

        try {
            const formData = new FormData();
            formData.append('data', captchaImage);
            let url = config.captchaSolverEndpoint;
            let result = await axios.post(url, formData, {
                headers: formData.getHeaders()
            });
            if (result && result.data) {
                captchaCode = result.data.toString();
            }
        } catch (error) {
            saveError(error);
        }

        if (!captchaCode) {
            tesseractCounter++;
            while (tesseractCounter > 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            let imageBuffer = Buffer.from(captchaImage, "base64");
            const worker = createWorker();
            await worker.load();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            const {data: {text}} = await worker.recognize(imageBuffer);
            await worker.terminate();
            captchaCode = text;
            tesseractCounter--;
        }

        await page.type('#securityCode', captchaCode);
        await page.evaluate(() => {
            document.querySelector('button[name=submit]').click();
        });
        try {
            await page.waitForSelector('#securityCode', {hidden: true, timeout: 10000});
        } catch (error) {
            return null;
        }
        await page.waitForTimeout(10);
        return 1;
    } catch (error) {
        saveError(error);
        return null;
    }
}
