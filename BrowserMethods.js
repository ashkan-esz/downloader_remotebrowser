const axios = require('axios').default;
const axiosRetry = require("axios-retry");
const cheerio = require('cheerio');
const {getPageObj, setPageFree, closePage} = require('./puppetterBrowser');
const {createWorker} = require('tesseract.js');
const FormData = require('form-data');
const {checkSubtitleExist, uploadSubtitleToS3ByURl} = require('./cloudStorage');
const {saveError} = require('./saveError');

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
        subtitles: [],
        error: false,
        message: 'ok',
    }

    let temp = await handleSourceSpecificStuff(url);
    if (temp) {
        pageData = {...pageData, ...temp};
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
    let subtitles = [];
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
        try {
            subtitles = await uploadAnimeListSubtitles(pageObj);
        } catch (error) {
            await closePage(pageObj.id);
            if (canRetry) {
                return await handleSourceSpecificStuff(url, false);
            }
        }
    }
    let data = {
        pageContent: await pageObj.page.content(),
        responseUrl: pageObj.page.url(),
        subtitles: subtitles,
    }
    setPageFree(pageObj.id);
    return data;
}

async function loadPage(url, isAnimelist, pageObj, canRetry = true) {
    try {
        if (isAnimelist) {
            await pageObj.page.goto(url, {waitUntil: "domcontentloaded"});
            await loginAnimeList(pageObj);
        } else {
            await pageObj.page.goto(url);
        }
        if (url.includes('digimovie')) {
            await pageObj.page.waitForSelector('.container');
            if (url.match(/\/serie$|\/page\//g) || url.replace('https://', '').split('/').length === 1) {
                await pageObj.page.waitForSelector('.main_site', {timeout: 15000});
                await pageObj.page.waitForSelector('.alphapageNavi', {timeout: 15000});
            }
        }
        if (url.includes('valamovie')) {
            await pageObj.page.waitForSelector('.container');
        }
        return true;
    } catch (error) {
        await closePage(pageObj.id);
        let temp = await getPageObj();
        pageObj.id = temp.id;
        pageObj.page = temp.page;
        if (pageObj && canRetry) {
            return await loadPage(url, isAnimelist, pageObj, false);
        } else {
            saveError(error);
            return false;
        }
    }
}

async function loginAnimeList(pageObj) {
    let email = process.env.ANIMELIST_EMAIL;
    let password = process.env.ANIMELIST_PASSWORD;
    let loginButton = await pageObj.page.$x("//a[contains(., 'ورود و ثبت نام')]");
    if (loginButton.length === 0) {
        return;
    }
    await Promise.all([
        loginButton[0].click(),
        pageObj.page.waitForNavigation()
    ]);
    await pageObj.page.$eval('input[name=email]', (el, email) => el.value = email, email);
    await pageObj.page.$eval('input[name=password]', (el, password) => el.value = password, password);
    await Promise.all([
        pageObj.page.click('.login__sign-in'),
        pageObj.page.waitForNavigation({waitUntil: "domcontentloaded"}),
    ]);
}

async function uploadAnimeListSubtitles(pageObj) {
    let pageContent = await pageObj.page.content();
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
                url: '',
                insertData: new Date(),
            }
            subtitles.push(subtitle);
        }
    }
    subtitles = subtitles.sort((a, b) =>
        Number(b.episode.split('-').pop()) - Number(a.episode.split('-').pop())
    );
    await setSubtitlesFileName(pageObj, subtitles);
    subtitles = await filterExistedSubtitles(subtitles);
    await uploadNewSubtitlesToCloudStorage(pageObj, subtitles);
    subtitles = subtitles.sort((a, b) =>
        Number(b.episode.split('-').pop()) - Number(a.episode.split('-').pop())
    );
    return subtitles;
}

async function uploadNewSubtitlesToCloudStorage(pageObj, subtitles) {
    const cookies = await pageObj.page.cookies();
    const cookiesString = cookies.map(ck => ck.name + '=' + ck.value).join(';');
    let promiseArray = [];
    for (let i = 0; i < subtitles.length; i++) {
        try {
            let promise = uploadSubtitleToS3ByURl(subtitles[i].originalUrl, subtitles[i].fileName, cookiesString).then(subtitleUrl => {
                if (subtitleUrl) {
                    subtitles[i].originalUrl = subtitles[i].originalUrl.replace(/\?token=.+$/g, '?token=');
                    subtitles[i].url = subtitleUrl;
                }
            });
            promiseArray.push(promise);
            if (promiseArray.length > 10) {
                await Promise.all(promiseArray);
                promiseArray = [];
            }
        } catch (error) {
            saveError(error);
        }
    }
    await Promise.all(promiseArray);
    subtitles = subtitles.filter(item => item.url !== '');
}

async function filterExistedSubtitles(subtitles) {
    let newSubtitles = [];
    let promiseArray = [];
    for (let i = 0; i < subtitles.length; i++) {
        try {
            let promise = checkSubtitleExist(subtitles[i].fileName).then(exist => {
                if (!exist) {
                    newSubtitles.push(subtitles[i]);
                }
            });
            promiseArray.push(promise);
            if (promiseArray.length > 20) {
                await Promise.all(promiseArray);
                promiseArray = [];
            }
        } catch (error) {
            saveError(error);
        }
    }
    await Promise.all(promiseArray);
    return newSubtitles;
}

async function setSubtitlesFileName(pageObj, subtitles) {
    const cookies = await pageObj.page.cookies();
    let promiseArray = [];
    for (let i = 0; i < subtitles.length; i++) {
        try {
            let promise = axios.head(subtitles[i].originalUrl, {
                responseType: 'stream',
                headers: {
                    Cookie: cookies.map(ck => ck.name + '=' + ck.value).join(';')
                }
            }).then(response => {
                subtitles[i].fileName = `animelist-${response.headers['content-disposition'].replace('attachment; filename=', '').replace(/["']/g, '')}`;
            });
            promiseArray.push(promise);
            if (promiseArray.length > 20) {
                await Promise.all(promiseArray);
                promiseArray = [];
            }
        } catch (error) {
            saveError(error);
        }
    }
    await Promise.all(promiseArray);
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
