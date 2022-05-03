import config from "../config/index.js";
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
