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
    injectUtilityMethodsToPageContext, waitForCookiesAndCloseIt
} from "./core/wol_pub_scraping_tools.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import sanitize from "sanitize-filename";
import {commanderParseArticleUrl} from "./core/program_input.mjs";


async function goToTodayPage() {
    const todayLink = '#menuToday';
    await page.waitForSelector(todayLink);
    await page.click(todayLink);
    await page.waitForNavigation();
}

async function goToThisWeekWatchtowerArticle() {
    const thisWeekWatchtowerArticle = '.todayItems .todayItem.pub-w .it';
    await page.waitForSelector(thisWeekWatchtowerArticle);
    await page.click(thisWeekWatchtowerArticle);
    await page.waitForNavigation();
}

/**
 * @param {string} selector
 * @returns {Promise<string>}
 */
async function extractFootnoteContent(selector) {
    const fnId = await page.$eval(selector, el => el.getAttribute('data-fnid'));
    return extractElementText(`#footnote${fnId}`, page).then(text => text.slice(2));
}

async function extractTeachBlock() {
    const title = await extractElementText('.blockTeach.rule .boxTtl', page);
    const listItems = await extractTextFromElements('.blockTeach.rule ul li', page);
    return {title, listItems};
}

/**
 * Represents the structure of an article with religious content.
 * @typedef {Object} StudyArticle
 * @property {string} articleNum - The unique identifier of the article.
 * @property {string} title - The getJSONToProcess title of the article.
 * @property {string[]} subTitles - Subtitles within the article marking new sections or key points.
 * @property {string} mainCite - A central scripture or quote underpinning the theme of the article.
 * @property {string} preview - A summary of the article's content.
 * @property {ArticleSection[]} body - Major sections of the article.
 * @property {TeachBlock} teachBlock - A section designed for key questions or discussion points.
 */

/**
 * A special section designed for further discussion or personal study, encapsulating key questions or points.
 * @typedef {Object} TeachBlock
 * @property {string} title - The title indicating the nature of the discussion points.
 * @property {string[]} listItems - Questions or statements for critical thought derived from the article.
 */

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<StudyArticle>}
 */
async function extractArticleContents(page) {
    await page.waitForSelector(`#article`);
    await injectUtilityMethodsToPageContext(page);

    const articleNum = await extractElementText('#p1', page);
    const title = await extractElementText('#p2', page);
    const mainCite = await extractElementText('#p3', page);
    const preview = await extractFootnoteContent('#p5 .fn');
    const subTitles = await extractTextFromElements('.section > h2', page);
    const body = await extractBodyInSections(page);
    const teachBlock = await extractTeachBlock();

    return {
        articleNum,
        title,
        subTitles,
        mainCite,
        preview,
        body,
        teachBlock,
    };
}

const log = log4js.getLogger("main");
const program = new Command();
program
    .description('Scrape article data in JSON format')
    .option('-d, --debug', 'output extra debugging')
    .option('-u, --article-url [articleUrl]', 'The URL to an article in WOL', commanderParseArticleUrl)
    .parse();

const programOptions = program.opts();

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

if (programOptions.articleUrl) {
    log.info('using specific article url: %s', programOptions.articleUrl);
    await page.goto(programOptions.articleUrl);
    await page.waitForNavigation();
} else {
    log.info("using this' week article");
    await page.goto(`https://wol.jw.org/es/`);
    await goToTodayPage();
    await goToThisWeekWatchtowerArticle();
}
log.info('article url loaded');

await waitForCookiesAndCloseIt(page);
log.info('cookies closed');

const articleContents = await extractArticleContents(page);

const runsDir = await createRunsDirIfRequired('./runs/pub_w_scrape');
const thisRunDir = await createThisRunDir(runsDir);
const diskPath = await writeJSONToDisk(
    thisRunDir,
    `${sanitize(articleContents.articleNum)} — ${sanitize(articleContents.title)}.json`,
    articleContents
);
log.info('scrape result written in: %s', diskPath);

await browser.close();
log.info('program finished');
