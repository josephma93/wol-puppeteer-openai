import {readFile} from "node:fs/promises";
import log4js from 'log4js'
import {InvalidArgumentError} from "commander";

const log = log4js.getLogger("program_input");

export function commanderParseArticleUrl(potentialUrl, dummyPrevious) {
    const VALID_DOMAIN = 'wol.jw.org';
    try {
        new URL(potentialUrl);
    } catch (error) {
        throw new InvalidArgumentError(`The given articleUrl is not a valid URL.`);
    }
    const url = new URL(potentialUrl);
    if (url.hostname !== VALID_DOMAIN) {
        throw new InvalidArgumentError(`The given articleUrl doesn't point to ${VALID_DOMAIN}.`);
    }
    return url;
}

export async function readJsonFromFile(filePath) {
    try {
        log.debug(`reading json from: ${filePath}`);
        const data = await readFile(filePath, {encoding: 'utf-8'});
        log.info(`json data was read successfully from: ${filePath}`);
        return JSON.parse(data);
    } catch (err) {
        log.error("Error reading or parsing file: %j", err);
        throw err;
    }
}

export async function readJsonFromStdin() {
    if (process.stdin.isTTY) {
        log.error('No pipe detected. This script expects data to be piped into it.');
        return Promise.reject(new Error('No pipe detected'));
    }

    return new Promise((resolve, reject) => {
        let rawData = '';
        log.debug(`starting stdin data read...`);
        process.stdin.resume();
        process.stdin.setEncoding('utf-8');

        process.stdin.on('data', chunk => {
            log.debug(`stdin chunk received`);
            rawData += chunk;
        });

        process.stdin.on('end', () => {
            log.debug(`stdin stream ended`);
            try {
                resolve(JSON.parse(rawData));
                log.info(`json data was read successfully from stdin`);
            } catch (err) {
                log.error("Error parsing JSON from stdin: %j", err);
                reject(err);
            }
        });
    });
}

export async function getJSONToProcess() {
    const filePath = process.argv[2]; // Get file path from command line arguments

    let jsonToProcess;
    if (filePath) {
        log.info(`file path mode detected, starting fs read...`);
        jsonToProcess = await readJsonFromFile(filePath);
    } else {
        log.info(`stdin mode detected, starting stream read...`);
        jsonToProcess = await readJsonFromStdin();
    }

    if (!jsonToProcess) {
        const errMsg = `Unable to read JSON to process.`;
        log.error(errMsg);
        throw new Error(errMsg);
    }

    return jsonToProcess;
}
