import {startProgram} from "./pub_scrape_escentials.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import sanitize from "sanitize-filename";
import {
    buildCitationData,
    extractElementText,
    getTrimmedText,
    injectUtilityMethodsToPageContext
} from "./core/wol_pub_scraping_tools.mjs";

/**
 * @typedef {Object} MainTalkingPoint
 * @property {string} subTitle - The main point title.
 * @property {CitationData} citation - The text citation data extracted.
 */

/**
 * @typedef {Object} MidWeekSpeechMaterial
 * @property {string} title - The title of the speech.
 * @property {string} period - In which period of the year is this speech scheduled to be delivered.
 * @property {MainTalkingPoint[]} mainPoints - Major talking points.
 * @property {Figure[]} figures - Figures or images included within the section.
 */

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<MidWeekSpeechMaterial>}
 */
async function extractArticleContents(page) {
    const speechAreaSelector = '#tt8';
    const subTitlesSelector = 'div[id*="tt"]:not(.du-color--textSubdued) > p';

    await page.waitForSelector(speechAreaSelector);
    const $speechSection = await page.$(speechAreaSelector);

    await injectUtilityMethodsToPageContext(page);
    const period = await extractElementText('.resultsNavigationSelected:not(.navPublications)', page);
    const title = (await extractElementText('h3', $speechSection)).replace(/^\d+?\W/, '').trim();
    /** @type {Figure[]} */ const figures = await $speechSection.$$eval(`div[id*="f"] figure`, els => els.map(mapFigureElToObj));

    const $subTitles = await $speechSection.$$(subTitlesSelector);
    /** @type {MainTalkingPoint[]} */let mainPoints = [];
    for (let i = 0; i < $subTitles.length; i++) {
        const $subTitle = $subTitles[i];
        log.debug('scraping subTitle %d of %d', i + 1, $subTitles.length);

        const $references = await $subTitle.$$(`a`);
        const citation = await buildCitationData(page, $subTitle, $references);
        mainPoints.push({
            subTitle: await $subTitle.evaluate(getTrimmedText),
            citation,
        });
        log.debug('expanded citations were extracted');
    }
    log.debug('main points were extracted');

    return {
        period,
        title,
        figures,
        mainPoints,
    };
}

const {log, browser, page} = await startProgram();

try {
    const articleContents = await extractArticleContents(page);
    const runsDir = await createRunsDirIfRequired('./runs/pub_mwb24_scrape');
    const thisRunDir = await createThisRunDir(runsDir);
    const diskPath = await writeJSONToDisk(
        thisRunDir,
        `${sanitize(articleContents.period)} — ${sanitize(articleContents.title)}.json`,
        articleContents
    );
    log.info('scrape result written to: %s', diskPath);
} catch (e) {
    log.error(e);
} finally {
    await browser.close();
    log.info('program finished');
}
