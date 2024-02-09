import log4js from 'log4js'
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
import {Command} from 'commander';
import puppeteer from "puppeteer";
import {
    extractBodyInSections,
    extractElementText,
    extractTextFromElements,
    injectUtilityMethodsToPageContext,
    waitForCookiesAndCloseIt
} from "./core/wol_pub_scraping_tools.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import sanitize from "sanitize-filename";
import {commanderParseArticleUrl} from "./core/program_input.mjs";

/**
 * Represents the structure of an article with religious content.
 * @typedef {Object} BTArticle
 * @property {string} captNum - The unique identifier of the chapter.
 * @property {string} title - The title of the article.
 * @property {string[]} subTitles - Subtitles within the article marking new sections or key points.
 * @property {string} openingContent - A central quote underpinning the theme of the article.
 * @property {string} themeScripture - The scripture cite from which the article is based.
 * @property {ArticleSection[]} sections - Major sections of the article.
 */

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<BTArticle>}
 */
async function extractArticleContents(page) {
    await page.waitForSelector(`#article`);
    log.info('article was found');
    await injectUtilityMethodsToPageContext(page);

    const captNum = await extractElementText('#p1', page);
    const title = await extractElementText('#p2', page);
    const openingContent = await extractElementText('#p3', page);
    const themeScripture = await extractElementText('#p4', page);
    const subTitles = await extractTextFromElements('.section > h2', page);
    const sections = await extractBodyInSections(page);

    return {
        captNum,
        title,
        subTitles,
        openingContent,
        themeScripture,
        sections,
    };
}

const log = log4js.getLogger("main");
const program = new Command();
program
    .description('Scrape article data in JSON format')
    .option('-d, --debug', 'output extra debugging')
    .option('-u, --article-url <articleUrl>', 'The URL to an article in WOL', commanderParseArticleUrl)
    .parse();

const programOptions = program.opts();

log.info('program started');

const headlessMode = programOptions.debug ? false : 'new';
log.debug('running with headless mode: %s', headlessMode);

log.info('using specific article url: %s', programOptions.articleUrl);

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

await page.goto(programOptions.articleUrl);
await page.waitForNavigation();
log.info('article url loaded');

await waitForCookiesAndCloseIt(page);
log.info('cookies closed');

const articleContents = await extractArticleContents(page);

const runsDir = await createRunsDirIfRequired('./runs/pub_bt_scrape');
const thisRunDir = await createThisRunDir(runsDir);
const diskPath = await writeJSONToDisk(
    thisRunDir,
    `${sanitize(articleContents.captNum)} — ${sanitize(articleContents.title)}.json`,
    articleContents
);
log.info('scrape result written in: %s', diskPath);

await browser.close();
log.info('program finished');
