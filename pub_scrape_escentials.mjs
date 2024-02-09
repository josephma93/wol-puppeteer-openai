import log4js from "log4js";
log4js.configure({
    appenders: {
        out: {
            type: 'stdout'
        }
    },
    categories: {
        default: {
            appenders: ['out'],
            level: 'debug'
        }
    },
});

import {Command} from "commander";
import {commanderParseArticleUrl} from "./core/program_input.mjs";
import puppeteer from "puppeteer";
import {waitForCookiesAndCloseIt} from "./core/wol_pub_scraping_tools.mjs";

function commanderDefaults() {
    const program = new Command();
    program
        .description('Scrape article data in JSON format')
        .option('-d, --debug', 'output extra debugging')
        .option('-u, --article-url <articleUrl>', 'The URL to an article in WOL', commanderParseArticleUrl)
        .parse();

    return program.opts();
}

export async function startProgram({ configureCommander = commanderDefaults } = {}) {
    const log = log4js.getLogger("main");
    const programOptions = configureCommander();

    log.info('program started');

    const headlessMode = programOptions.debug ? false : 'new';
    log.debug('running with headless mode: %s', headlessMode);

    const browser = await puppeteer.launch({
        headless: headlessMode,
        args: ['--lang=es-CR,es'],
        slowMo: programOptions.debug ? 25 : undefined,
    });
    log.info('browser launched');

    const pages = await browser.pages();
    const page = pages[0];
    log.info('page selected');

    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    log.info('user agent set');

    log.info('using specific article url: %s', programOptions.articleUrl);
    await page.goto(programOptions.articleUrl);
    await page.waitForNavigation();
    log.info('article url loaded');

    await waitForCookiesAndCloseIt(page);
    log.info('cookies closed');
    return {log, browser, page};
}