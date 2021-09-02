const axios = require('axios').default;
const {S3Client, PutObjectCommand, HeadObjectCommand} = require('@aws-sdk/client-s3');
const {saveError} = require("./saveError");

const s3 = new S3Client({
    region: 'default',
    forcePathStyle: false,
    endpoint: process.env.CLOUAD_STORAGE_ENDPOINT,
    credentials: {
        accessKeyId: process.env.CLOUAD_STORAGE_ACCESS_KEY,
        secretAccessKey: process.env.CLOUAD_STORAGE_SECRET_ACCESS_KEY,
    },
});

export async function uploadSubtitleToS3ByURl(url, fileName, cookie, canRetry = true) {
    try {
        let response = await axios.get(url, {
            responseType: "arraybuffer",
            responseEncoding: "binary",
            headers: {
                Cookie: cookie,
            }
        });
        const params = {
            ContentType: response.headers["content-type"],
            ContentLength: response.data.length.toString(),
            Bucket: 'download-subtitle',
            Body: response.data,
            Key: fileName,
            ACL: 'public-read',
        };
        let command = new PutObjectCommand(params);
        await s3.send(command);
        return `https://download-subtitle.${process.env.CLOUAD_STORAGE_WEBSITE_ENDPOINT}/${fileName}`;
    } catch (error) {
        if (error.code === 'ENOTFOUND' && canRetry) {
            return await uploadSubtitleToS3ByURl(url, fileName, cookie, false);
        }
        saveError(error);
        return '';
    }
}

export async function checkSubtitleExist(fileName) {
    try {
        const params = {
            Bucket: 'download-subtitle',
            Key: fileName,
        };
        let command = new HeadObjectCommand(params);
        let result = await s3.send(command);
        return result['$metadata'].httpStatusCode === 200;
    } catch (error) {
        let statusCode = error['$metadata'].httpStatusCode;
        if (statusCode !== 404 && statusCode !== 200) {
            saveError(error);
        }
        return statusCode !== 404;
    }
}
