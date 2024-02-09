import {
    extractBodyInSections,
    extractElementText,
    extractTextFromElements,
    injectUtilityMethodsToPageContext
} from "./core/wol_pub_scraping_tools.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import sanitize from "sanitize-filename";
import {startProgram} from "./pub_scrape_escentials.mjs";

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

const {log, browser, page} = await startProgram();

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
