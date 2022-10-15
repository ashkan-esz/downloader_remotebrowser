import {Router} from "express";
import middlewares from '../middlewares/index.js';
import {executeUrl} from "../../browser/puppetterBrowser.js";

const router = Router();

router.get('/getDownloadLink', middlewares.checkPassword, async (req, res) => {
    let youtubeUrl = req.query.youtubeUrl;
    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
        return res.json({
            error: true,
            message: 'Invalid parameter youtubeUrl :: String',
        });
    }

    let result = await executeUrl(youtubeUrl, false, [], false, 'downloadYoutube');
    result.error = result.res === null;
    result.message = 'ok';
    return res.json(result);
});


export default router;
