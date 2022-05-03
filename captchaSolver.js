import config from "./config/index.js";
import axios from "axios";
import axiosRetry from "axios-retry";
import FormData from "form-data";
import {createWorker} from "tesseract.js";
import {saveError} from "./saveError.js";

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

export async function getCaptchaCode(captchaImage) {
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

    try {
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
    } catch (error) {
        saveError();
        tesseractCounter--;
    }

    return captchaCode;
}
