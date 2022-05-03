import config from "../config/index.js";
import {Router} from "express";
import {getPageData} from "../BrowserMethods.js";

const router = Router();

router.get('/', async (req, res) => {
    let {password, url} = req.query;
    if (password === config.serverPassword) {
        if (url) {
            let pageData = await getPageData(url);
            pageData.error = pageData.pageContent === null;
            pageData.message = pageData.pageContent === null ? 'error' : 'ok';
            return res.json(pageData);
        } else {
            return res.json({error: true, message: 'empty url'});
        }
    } else {
        return res.json({error: true, message: 'wrong password!'});
    }
});


export default router;
