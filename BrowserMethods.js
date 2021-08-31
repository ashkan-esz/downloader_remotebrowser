const axios = require('axios').default;
const axiosRetry = require("axios-retry");
const {getPageObj, setPageFree, closePage} = require('./puppetterBrowser');
const {createWorker} = require('tesseract.js');
const FormData = require('form-data');

axiosRetry(axios, {
    retries: 3, // number of retries
    retryDelay: (retryCount) => {
        return retryCount * 1000; // time interval between retries
    },
    retryCondition: (error) => (
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNABORTED' ||
        (error.response &&
            error.response.status !== 429 &&
            error.response.status !== 404 &&
            error.response.status !== 403)
    ),
});

let tesseractCounter = 0;

export async function getPageData(url) {
    let pageData = {
        pageContent: null,
        responseUrl: '',
        subtitleLinks: [],
        error: false,
        message: 'ok',
    }

    let temp = await handleSourceSpecificStuff(url);
    if (temp) {
        pageData.pageContent = temp.pageContent;
        pageData.responseUrl = temp.responseUrl;
    }

    return pageData;
}

async function handleSourceSpecificStuff(url, canRetry = true) {
    let pageObj = await getPageObj();
    if (!pageObj) {
        pageObj = await getPageObj();
        if (!pageObj) {
            return null;
        }
    }

    let isAnimelist = url.includes('anime-list') || url.includes('animelist');
    let pageLoaded = await loadPage(url, isAnimelist, pageObj);
    if (!pageLoaded) {
        return null;
    }
    if (isAnimelist && url.includes('/anime/')) {
        let captchaResult = await handleAnimeListCaptcha(pageObj.page);
        if (!captchaResult) {
            await closePage(pageObj.id);
            if (canRetry) {
                return await handleSourceSpecificStuff(url, false);
            } else {
                return null;
            }
        }
    }
    let data = {
        pageContent: await pageObj.page.content(),
        responseUrl: pageObj.page.url(),
    }
    setPageFree(pageObj.id);
    return data;
}

async function loadPage(url, isAnimelist, pageObj, canRetry = true) {
    try {
        if (isAnimelist) {
            await pageObj.page.goto(url, {waitUntil: "domcontentloaded"});
        } else {
            await pageObj.page.goto(url);
        }
        if (url.includes('digimovie')) {
            await pageObj.page.waitForSelector('.container');
            if (url.match(/\/serie$|\/page\//g) || url.replace('https://', '').split('/').length === 1) {
                await pageObj.page.waitForSelector('.main_site');
                await pageObj.page.waitForSelector('.alphapageNavi');
            }
        }
        return true;
    } catch (error) {
        await closePage(pageObj.id);
        pageObj = await getPageObj();
        if (pageObj && canRetry) {
            return await loadPage(url, isAnimelist, pageObj, false);
        } else {
            saveError(error);
            return false;
        }
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
            let url = process.env.CAPTCHA_SOLVER_ENDPOINT;
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
                await new Promise(resolve => setTimeout(resolve, 2));
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
