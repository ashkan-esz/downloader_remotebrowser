import config from "../../config/index.js";

export default function checkPassword(req, res, next) {
    if (req.query.password === config.serverPassword) {
        return next();
    }
    return res.json({error: true, message: 'wrong password!'});
}
