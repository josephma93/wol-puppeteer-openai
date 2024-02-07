import path from 'node:path';
import { promises as fs } from 'node:fs';
import log4js from 'log4js'

const log = log4js.getLogger("program_output");

export async function createRunsDirIfRequired(dirPath) {
    const runsDir = path.resolve(dirPath);

    try {
        await fs.access(runsDir);
        log.info(`runs directory already exists`);
    } catch {
        await fs.mkdir(runsDir);
        log.info(`runs directory successfully created`);
    }

    return runsDir;
}

export async function createThisRunDir(runsDir) {
    const timestamp = new Date().toISOString();
    const runDir = path.join(runsDir, timestamp.replace(/:/g, '-')); // Replace ':' to avoid issues on some OS
    await fs.mkdir(runDir);
    log.info(`this run directory successfully created`);
    return runDir;
}

export async function writeFileToDisk(dirPath, fileName, textToWrite) {
    const filePath = path.join(dirPath, fileName);
    log.debug(`writing to: ${filePath}`);
    await fs.writeFile(filePath, textToWrite);
    log.info(`successfully written to: ${filePath}`);
}

export async function writeJSONToDisk(dirPath, fileName, jsonToWrite) {
    const filePath = path.join(dirPath, fileName);
    log.debug(`writing json to: ${filePath}`);
    await fs.writeFile(filePath, JSON.stringify(jsonToWrite, null, 2));
    log.info(`json data successfully written to: ${filePath}`);
}
