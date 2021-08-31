const router = require('express').Router();
const {getPageData} = require('../BrowserMethods');

router.get('/', async (req, res) => {
    let {password, url} = req.query;
    if (password === process.env.PASSWORD) {
        if (url) {
            let pageData = await getPageData(url);
            return res.json(pageData);
        } else {
            return res.json({error: true, message: 'empty url'});
        }
    } else {
        return res.json({error: true, message: 'wrong password!'});
    }
});


export default router;
