import {Router} from "express";
import middlewares from '../middlewares/index.js';
import {downloadFile, removeFile} from "../../files/files.js";
import {getFilesStatus} from "../../serverStatus.js";

const router = Router();

router.get('/status', middlewares.checkPassword, async (req, res) => {
    let result = await getFilesStatus();
    if (result) {
        result.error = false;
        result.message = 'ok';
        return res.json(result);
    } else {
        return res.json({error: true, message: 'Internal server error'});
    }
});

router.get('/removeFile/:fileName', middlewares.checkPassword, async (req, res) => {
    let fileName = req.params.fileName;
    if (!fileName || typeof fileName !== 'string') {
        return res.json({
            error: true,
            message: 'Invalid parameter fileName :: String',
        });
    }
    let newFileStatus = req.query.newFileStatus === 'true' || req.query.newFileStatus === true;
    let result = await removeFile(fileName, newFileStatus);
    result.error = result.message !== 'ok';
    return res.json(result);
});

router.get('/downloadAndUploadFile/:downloadLink', middlewares.checkPassword, async (req, res) => {
    let downloadLink = req.params.downloadLink;
    if (!downloadLink || typeof downloadLink !== 'string') {
        return res.json({
            error: true,
            message: 'Invalid parameter downloadLink :: String',
        });
    }
    let result = await downloadFile(downloadLink, false);
    result.error = result.message !== 'ok';
    return res.json(result);
});

export default router;
