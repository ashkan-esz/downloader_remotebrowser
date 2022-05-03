import config from "../config/index.js";
import * as cheerio from "cheerio";
import {getCaptchaCode} from "../captchaSolver.js";
import {saveError} from "../saveError.js";

export async function loginAnimeList(page) {
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

export async function uploadAnimeListSubtitles(page) {
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

export async function handleAnimeListCaptcha(page) {
    try {
        let captchaImage = await page.evaluate('document.querySelector("#captcha").getAttribute("src")');
        captchaImage = captchaImage.split(';base64,').pop();
        let captchaCode = await getCaptchaCode(captchaImage);

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
