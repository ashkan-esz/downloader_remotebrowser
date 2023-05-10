import {Router} from "express";
import middlewares from '../middlewares/index.js';
import {getServerResourcesStatus} from "../../serverStatus.js";

const router = Router();

router.get('/', middlewares.checkPassword, async (req, res) => {
    let result = await getServerResourcesStatus();
    if (result) {
        result.error = false;
        result.message = 'ok';
        return res.json(result);
    } else {
        return res.json({error: true, message: 'Internal server error'});
    }
});


export default router;
