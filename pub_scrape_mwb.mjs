import {startProgram} from "./pub_scrape_escentials.mjs";
import {createRunsDirIfRequired, createThisRunDir, writeJSONToDisk} from "./core/program_output.mjs";
import sanitize from "sanitize-filename";
import {
    addAndGetScriptureFootnotes,
    extractElementText,
    getTrimmedText,
    injectUtilityMethodsToPageContext
} from "./core/wol_pub_scraping_tools.mjs";

/**
 * @typedef {Object} MainTalkingPoint
 * @property {string} subTitle - The main point title.
 * @property {TooltipCitationData[]} citations - The text citations.
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
        const citations = await addAndGetScriptureFootnotes(page, $subTitle, $references);
        mainPoints.push({
            subTitle: await $subTitle.evaluate(getTrimmedText),
            citations,
        });

        for (const citation of citations) {

            if (citation.recursiveBibleCitations.length) {
                citation.text += `\n---\n`;
            }

            for (let i = 0; i < citation.recursiveBibleCitations.length; i++) {
                const recursiveBibleCitation = citation.recursiveBibleCitations[i];
                log.debug('expanding citation %d of %d', i + 1, citation.recursiveBibleCitations.length);

                const response = await fetch(
                    `https://wol.jw.org/${recursiveBibleCitation.href.slice(3)}`, {
                        "headers": {
                            "accept": "application/json, text/javascript, */*; q=0.01",
                            "accept-language": "en-US,en;q=0.9",
                            "cache-control": "no-cache",
                            "pragma": "no-cache",
                        },
                        "referrer": "https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/18/15",
                        "body": null,
                        "method": "GET",
                    }
                );
                let asJson = await response.json();
                const citationContent = asJson.items[0].content;
                const recursiveCitationText = await page.evaluate((citationHTML) => {
                    // Create a temporary div element
                    let tempDiv = document.createElement('div');
                    // Set the innerHTML of the div to the provided HTML snippet
                    tempDiv.innerHTML = citationHTML;
                    [...tempDiv.querySelectorAll('a')].forEach(a => a.remove());
                    // Access the textContent property of the div
                    let textContent = tempDiv.textContent || tempDiv.innerText;
                    // Clean up the temporary div
                    tempDiv = null;
                    return textContent;
                }, citationContent);
                citation.text = citation.text.replace(`${recursiveBibleCitation.text}`, `${recursiveBibleCitation.text} [^${recursiveBibleCitation.citeNum}]`);
                citation.text += `[^${recursiveBibleCitation.citeNum}]: ${recursiveCitationText}\n`;
            }

            citation.text = citation.text.trim();
        }
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

const articleContents = await extractArticleContents(page);

const runsDir = await createRunsDirIfRequired('./runs/pub_mwb24_scrape');
const thisRunDir = await createThisRunDir(runsDir);
const diskPath = await writeJSONToDisk(
    thisRunDir,
    `${sanitize(articleContents.period)} — ${sanitize(articleContents.title)}.json`,
    articleContents
);
log.info('scrape result written in: %s', diskPath);

await browser.close();
log.info('program finished');