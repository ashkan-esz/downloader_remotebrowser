import config from "./config/index.js";
import * as Sentry from "@sentry/node";
import Tracing from "@sentry/tracing";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import {closeBrowser} from "./puppetterBrowser.js";
//--------------------------------------
const app = express();
//---------------Routes-----------------
import headlessBrowser from "./routes/headlessBrowser.js";
//--------------middleware--------------
Sentry.init({
    dsn: config.sentryDns,
    integrations: [
        new Sentry.Integrations.Http({tracing: true}),
        new Tracing.Integrations.Express({app}),
    ],
    tracesSampleRate: 0.02,
});
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(helmet());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(cors());
app.use(compression());
//--------------------------------------
//--------------------------------------
app.use('/headlessBrowser', headlessBrowser);

app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
        // Capture all 404 and 500 errors
        return error.status === 404 || error.status === 500;
    },
}));

app.use(function (req, res) {
    res.status(404).send({url: req.originalUrl + ' not found'})
});

app.use((err, req, res, next) => {
    res.status(500).json({error: true, message: 'server error'});
});

const server = app.listen(config.port, () => {
    console.log(`http://localhost:${config.port}`)
});

server.on('close', async () => {
    await closeBrowser();
    server.close();
});
