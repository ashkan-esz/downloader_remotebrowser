# Remote Browser

simple headless browser build by puppeteer to use in
project [downloader_api](https://github.com/ashkan-esz/downloader_api).

## Motivation

Need a customized headless browser.

## How to use

Run command `npm install` and then `npm run start`.


> you may want to change `--max_old_space_size` and `--gc_interval` values in start script.

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

| Prop                       | Description                                          | Required |
| -------------------------- | ---------------------------------------------------- | -------- |
| **`PORT`**                 | server port  | `false (default:3000)` |
| **`PASSWORD`** | password of crawler | `true` |
| **`SENTRY_DNS`** |  | `false` |
| **`CAPTCHA_SOLVER_ENDPOINT`** | a captcha resolver service | `false` |
| **`ANIMELIST_EMAIL`** | user to login anime source animelist | `true` |
| **`ANIMELIST_PASSWORD`** | password to login anime source animelist | `true` |
| **`CRAWLER_BROWSER_TAB_COUNT`** |  | `false (default: 3)` |

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
