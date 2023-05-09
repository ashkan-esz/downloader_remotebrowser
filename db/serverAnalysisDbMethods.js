import {v4 as uuidv4} from "uuid";
import getCollection from "./mongoDB.js";
import {saveError} from "../saveError.js";

export async function saveServerLog(logMessage) {
    try {
        let {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        let newServerLog = {
            message: logMessage,
            date: now,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            //new serverLog
            await collection.updateOne({
                _id: bucket[0]._id,
            }, {
                $push: {
                    serverLogs: {
                        $each: [newServerLog],
                        $position: 0,
                    }
                }
            });
        } else {
            //create new bucket
            let newBucket = getNewBucket(yearAndMonth);
            newBucket.serverLogs.push(newServerLog);
            await collection.insertOne(newBucket);
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function removeServerLogById(id) {
    try {
        let {bucket, collection} = await getCollectionAndBucket();

        if (bucket.length > 0) {
            let updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'serverLogs.id': id,
            }, {
                $pull: {
                    serverLogs: {id: id},
                }
            });

            if (updateResult.modifiedCount === 0) {
                return "not found";
            }
        } else {
            return "not found";
        }
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------------
//-----------------------------------------

export async function saveCrawlerWarning(message) {
    try {
        let {now, yearAndMonth, bucket, collection} = await getCollectionAndBucket();

        let newWarning = {
            message: message,
            date: now,
            resolved: false,
            resolvedDate: 0,
            count: 1,
            id: uuidv4(),
        };

        if (bucket.length > 0) {
            let updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                'warnings.message': message,
            }, {
                $set: {
                    'warnings.$.date': now,
                    'warnings.$.resolved': false,
                    'warnings.$.resolvedDate': 0,
                },
                $inc: {
                    'warnings.$.count': 1,
                }
            });

            if (updateResult.matchedCount === 0 && updateResult.modifiedCount === 0) {
                //new warning
                await collection.updateOne({
                    _id: bucket[0]._id,
                }, {
                    $push: {
                        warnings: newWarning
                    }
                });
            }
        } else {
            //create new bucket
            let newBucket = getNewBucket(yearAndMonth);
            newBucket.warnings.push(newWarning);
            await collection.insertOne(newBucket);
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function resolveCrawlerWarning(message) {
    try {
        let {bucket, collection} = await getCollectionAndBucket();

        if (bucket.length > 0) {
            let updateResult = await collection.updateOne({
                _id: bucket[0]._id,
                warnings: {$elemMatch: {message: message, resolved: false}}
            }, {
                $set: {
                    'warnings.$.resolved': true,
                    'warnings.$.resolvedDate': new Date(),
                }
            });

            if (updateResult.modifiedCount === 0) {
                return "not found";
            }
        } else {
            return "not found";
        }

        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

//-----------------------------------------
//-----------------------------------------

async function getCollectionAndBucket() {
    let collection = await getCollection('serverAnalysis');
    let now = new Date();
    let yearAndMonth = now.getFullYear() + '-' + (now.getMonth() + 1);

    let bucket = await collection.find({yearAndMonth: yearAndMonth}).limit(1).toArray();
    return {now, yearAndMonth, bucket, collection};
}

function getNewBucket(yearAndMonth) {
    return ({
        yearAndMonth: yearAndMonth,
        userCounts: [],
        crawlerLogs: [],
        serverLogs: [],
        warnings: [],
        googleCacheCalls: [],
    });
}
