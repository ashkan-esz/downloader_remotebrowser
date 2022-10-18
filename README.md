# Remote Browser

simple headless browser build by puppeteer to use in
project [downloader_api](https://github.com/ashkan-esz/downloader_api).

## Motivation

Need a customized headless browser.

## How to use

1. Set environment variables
2. Run command `npm install` and then `npm run start`.

> you may want to change `--max_old_space_size` and `--gc_interval` values in start script (optimized for 500mb ram).

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

| Prop                            | Description                                                                   | Required                 |
|---------------------------------|-------------------------------------------------------------------------------|--------------------------|
| **`PORT`**                      | server port                                                                   | `false (default:3000)`   |
| **`PASSWORD`**                  | password of crawler                                                           | `true`                   |
| **`SENTRY_DNS`**                |                                                                               | `false`                  |
| **`CAPTCHA_SOLVER_ENDPOINT`**   | a captcha resolver service                                                    | `false`                  |
| **`ANIMELIST_USERNAME`**        | user to login anime source animelist                                          | `false`                  |
| **`ANIMELIST_PASSWORD`**        | password to login anime source animelist                                      | `false`                  |
| **`CRAWLER_BROWSER_TAB_COUNT`** | browser tabs (no more than 3 if ram < 500mb) you can set to 8 with ram >= 1gb | `false (default: 3)`     |
| **`CRAWLER_MONITOR`**           | show crawler monitor from `puppeteer-cluster` package                         | `false`                  |
| **`PRINT_ERRORS`**              | show server errors in console                                                 | `false`                  |
| **`BLACKHOLE_PASSWORD`**        | password needed to login to [blackHole](https://blackhole.run)                | `true`                   |
| **`BLACKHOLE_FILE_SIZE_LIMIT`** | uploading file size limit                                                     | `false --> default: 512` |
| **`DATABASE_URL`**              | mongodb connection url                                                        | `false`                  |
| **`DISABLE_UPLOAD_JOB`**        | if set to true, upload job will be disabled                                   | `false`                  |
| **`TOTAL_MEMORY_AMOUNT`**       | amount of memory that app can use, by default its 512mb                       | `false`                  |
| **`TOTAL_DISK_SPACE`**          | amount of disk space that app can use, by default its 500mb                   | `false`                  |
| **`DEFAULT_USED_DISK_SPACE`**   | amount of disk space that app use in init state, by default its 0mb           | `false`                  |

<br/>

## Upload Job

**NOTE: Upload job run every 1 hour. check db collection ('torrentLinks') and download them first and then upload them
to blackHole system, save upload link to db.**

## API

- [GET /headlessBrowser/?password=PASSWORD&url=URL&cookieOnly=Boolean](api/routes/headlessBrowser.js)

```javascript
res = {
    pageContent: null || HTML,
    cookies: Object,
    responseUrl: String,
    retryCount: Int,
    error: Boolean,
    message: String,
    pageTitle: String,
}
```

<br/>

- [GET /files/status?password=PASSWORD](api/routes/filesRouter.js)

<br/>

- [GET /files/removeFile/[fileName]/?newFileStatus=Boolean&password=PASSWORD](api/routes/filesRouter.js)

<br/>

- [GET /files/downloadAndUploadFile/[downloadLink]?password=PASSWORD](api/routes/filesRouter.js)

<br/>

- [GET /youtube/getDownloadLink?password=PASSWORD&youtubeUrl=String](api/routes/youtubeRouter.js)

<br/>

## Future updates

- [x]  Efficient and low memory usage web crawler.
- [ ]  Clustering.
- [ ]  Documentation.
- [ ]  Write test.

## Contributing

Contributions are always welcome!

See `contributing.md` for ways to get started.

Please adhere to this project's `code of conduct`.

## Support

Contributions, issues, and feature requests are welcome!
Give a ⭐️ if you like this project!

## Author

**Ashkan Esz**

- [Profile](https://github.com/ashkan-esz "Ashkan esz")
- [Email](mailto:ashkanaz2828@gmail.com?subject=Hi "Hi!")
