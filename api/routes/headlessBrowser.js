import {Router} from "express";
import middlewares from '../middlewares/index.js';
import {getPageData} from "../../browser/BrowserMethods.js";

const router = Router();

router.get('/', middlewares.checkPassword, async (req, res) => {
    let {url, cookieOnly} = req.query;
    if (url) {
        let pageData = await getPageData(url, cookieOnly === 'true');
        pageData.error = pageData.pageContent === null;
        pageData.message = pageData.pageContent === null ? 'error' : 'ok';
        return res.json(pageData);
    } else {
        return res.json({error: true, message: 'empty url'});
    }
});


export default router;
