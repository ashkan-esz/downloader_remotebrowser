import config from "./config/index.js";
import * as Sentry from "@sentry/node";
import Tracing from "@sentry/tracing";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import {closeBrowser, startBrowser} from "./browser/puppetterBrowser.js";
import {saveError} from "./saveError.js";
//--------------------------------------
const app = express();
//---------------Routes-----------------
import headlessBrowser from "./api/routes/headlessBrowser.js";
import filesRouter from "./api/routes/filesRouter.js";
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
app.use(express.static('downloadFiles'));
//--------------------------------------
//--------------------------------------
await startBrowser();
//--------------------------------------
//--------------------------------------
app.use('/headlessBrowser', headlessBrowser);
app.use('/files', filesRouter);

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

process
    .on('unhandledRejection', async (reason, p) => {
        // Use your own logger here
        console.error(reason, 'Unhandled Rejection at Promise', p);
        reason.pp = p;
        await saveError(reason);
    })
    .on('uncaughtException', async err => {
        console.error(err, 'Uncaught Exception thrown');
        await saveError(err);
        // Optional: Ensure process will stop after this
        process.exit(1);
    });
