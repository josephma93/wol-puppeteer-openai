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



const {log, browser, page} = await startProgram();

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
