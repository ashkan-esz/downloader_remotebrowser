import getCollection from "./mongoDB.js";
import {saveError} from "../saveError.js";


export async function getLinksDB() {
    try {
        let collection = await getCollection("links");
        return collection.find({
                isDownloading: false,
                isUploading: false,
                uploadLink: '',
            }, {
                projection: {
                    downloadLink: 1,
                    size: 1,
                }
            }
        )
            .sort({size: 1, addDate: 1})
            .limit(10)
            .toArray();
    } catch (error) {
        saveError(error);
        return [];
    }
}

export async function updateLinkDataDB(downloadLink, updateFields) {
    try {
        let collection = await getCollection("links");
        await collection.updateOne({
            downloadLink: downloadLink,
        }, {
            $set: updateFields
        });
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}

export async function resetOutdatedFlagsDB() {
    try {
        let hoursAgo = new Date();
        hoursAgo.setHours(hoursAgo.getHours() - 6);
        let collection = await getCollection("links");
        await collection.updateMany({
            $or: [
                {
                    isDownloading: true,
                    startDownload: {$lte: hoursAgo},
                },
                {
                    isUploading: true,
                    startUpload: {$lte: hoursAgo},
                },
            ],
        }, {
            $set: {
                isDownloading: false,
                isUploading: false,
            }
        });
        return 'ok';
    } catch (error) {
        saveError(error);
        return 'error';
    }
}
