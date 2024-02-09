import log4js from "log4js";

const log = log4js.getLogger("scraping_tools");

/**
 * @param {string} txt
 * @returns {string}
 */
export function cleanText(txt) {
    return (typeof txt === 'string' ? txt : '').trim().replaceAll(' ', ' ');
}

/**
 * @param {HTMLElement} el
 * @returns {string}
 */
export function getTrimmedText(el) {
    return cleanText(el?.innerText ?? el?.textContent);
}

/**
 * Represents a paragraph within a section of the article.
 * @typedef {Object} ParagraphContents
 * @property {string} parNum - The paragraph number.
 * @property {string} text - The textual content of the paragraph.
 */

/**
 * @param {HTMLElement} p
 * @returns {ParagraphContents}
 */
export async function mapParagraphToObj(p) {
    const parNum = getTrimmedText(p.querySelector('.parNum sup'));

    return {
        parNum: parNum ? parNum : "1",
        text: getTrimmedText(p).replace(`${parNum} `, ''),
    };
}

/**
 * @param {HTMLElement} el
 */
export function mapQuestionElToObj(el) {

    function parseQNumText(pCovered) {
        let typeOfPCoverage = 'single';

        // Remove dot at the end
        pCovered = pCovered.slice(0, -1);
        if (pCovered.includes(',')) {
            // It's a two paragraph question
            typeOfPCoverage = 'double';
        } else if (pCovered.includes('-')) {
            // It's a paragraph range question
            typeOfPCoverage = 'range';
        }

        return {
            typeOfPCoverage,
            pCovered,
        }
    }

    function parseQText(question) {
        // Regex to find lettered questions (like "a)", "b)", etc.)
        const letteredQuestionRegex = /\b[a-z]\)\s+?\S+?/g;

        // Regex to find references (text inside parentheses)
        const referenceRegex = /\(([^)]+)\)/g;

        // Find all matches for lettered questions
        const letteredQuestions = question.match(letteredQuestionRegex) || [];
        const letteredQuestionsCount = letteredQuestions.length;

        // Find all matches for references
        const references = [...question.matchAll(referenceRegex)].map(match => match[1]);

        let letteredQuestionTexts = [];
        if (letteredQuestionsCount) {
            const questionsAfterCleaning = question.split(/\b[a-z]\)\s+?/g)
                .map(cleanText)
                .filter(Boolean)
                .map(t => {
                    if (references.length) {
                        t = references.reduce((a, r) => a.replace(`(${r})`, ''), t);
                    }
                    return t;
                });
            letteredQuestionTexts.push(...questionsAfterCleaning)
        }

        return {
            text: question,
            logicalQCount: letteredQuestionsCount > 1 ? letteredQuestionsCount : 1,
            letteredQCount: letteredQuestionsCount,
            letteredQuestionTexts,
            references,
        };
    }

    let qNumEl = el.querySelector(`strong`);
    let pCovered = getTrimmedText(qNumEl);
    // Isolate question(s) removing the paragraphs covered
    let question = getTrimmedText(el).replace(`${pCovered} `, '');

    return {
        ...parseQNumText(pCovered),
        ...parseQText(question),
    };
}

/**
 * @param {HTMLElement} figure
 */
export function mapFigureElToObj(figure) {
    const img = figure.querySelector('img');
    const figcaption = figure.querySelector('figcaption');

    let imageAlt = cleanText(img.alt);
    let figcaptionText = getTrimmedText(figcaption);
    let relatedParagraphs = [...figcaptionText.matchAll(/\(([^)]+)\)/g)].map(match => match[1]).pop() ?? '';
    let paragraphReferenceData = null;
    if (relatedParagraphs) {
        const execResult = /párrafos?\s(\d+)(?:\s([ya])\s(\d+))?/g.exec(relatedParagraphs);
        if (execResult) {
            const [, num1, separator, num2] = execResult;
            let typeOfPCoverage;
            let pCovered = [num1];

            if (separator === 'y') {
                typeOfPCoverage = 'double';
                pCovered = [num1, num2];
            } else if (separator === 'a') {
                typeOfPCoverage = 'range';
                pCovered = [];
                for (let i = +num1; i <= +num2; i++) {
                    pCovered.push(String(i));
                }
            } else {
                typeOfPCoverage = 'single';
            }

            paragraphReferenceData = {
                typeOfPCoverage,
                pCovered,
            };
        }
    }
    let footnoteDescription = "";

    const footnoteRef = figcaption ? figcaption.querySelector('.fn') : null;
    if (footnoteRef) {
        const fnId = footnoteRef.getAttribute('data-fnid');
        const clone = document.getElementById(`footnote${fnId}`).cloneNode(true);
        clone.querySelectorAll(`.fn-symbol, strong`).forEach(e => e.remove());
        footnoteDescription = getTrimmedText(clone);
    }

    return {
        imageAlt,
        figcaptionText,
        relatedParagraphs,
        paragraphReferenceData,
        footnoteDescription,
    };
}

/**
 * @param {HTMLElement} box
 */
export function mapSupplementBoxElToObj(box) {
    let title = getTrimmedText(box.querySelector('.boxTtl'));
    let figures = [...box.querySelectorAll('figure img')].map(img => cleanText(img.alt));
    let contents = getTrimmedText(box.querySelector('.boxContent'));

    return {
        title,
        figures,
        contents,
    };
}

export function injectUtilityMethodsToPageContext(page) {
    log.debug('injecting utility methods');
    return page.evaluate(
        (
            cleanTextFnDef,
            getTrimmedTextFnDef,
            mapParagraphToObjFnDef,
            mapQuestionElToObjFnDef,
            mapFigureElToObjFnDef,
            mapSupplementBoxElToObjFnDef,
        ) =>
            eval(`
                window.footnoteIndex = 1;
                window.cleanText = ${cleanTextFnDef};
                window.getTrimmedText = ${getTrimmedTextFnDef};
                window.mapParagraphToObj = ${mapParagraphToObjFnDef};
                window.mapQuestionElToObj = ${mapQuestionElToObjFnDef};
                window.mapFigureElToObj = ${mapFigureElToObjFnDef};
                window.mapSupplementBoxElToObj = ${mapSupplementBoxElToObjFnDef};
            `),
        cleanText.toString(),
        getTrimmedText.toString(),
        mapParagraphToObj.toString(),
        mapQuestionElToObj.toString(),
        mapFigureElToObj.toString(),
        mapSupplementBoxElToObj.toString(),
    );
}

/**
 * @typedef {import('puppeteer').Page} Page
 */

/**
 * @typedef {import('puppeteer').ElementHandle} ElementHandle
 */

/**
 * @param {string} selector
 * @param {Page|ElementHandle} context
 * @returns {Promise<string>}
 */
export function extractElementText(selector, context) {
    return context.$eval(selector, getTrimmedText);
}

/**
 * @param {string} selector
 * @param {Page|ElementHandle} context
 * @returns {Promise<string[]>}
 */
export function extractTextFromElements(selector, context) {
    return context.$$eval(selector, (els) => els.map(getTrimmedText));
}

async function fetchBiblicalCitationHtml(href) {

    const response = await fetch(
        `https://wol.jw.org/${href.slice(3)}`,
        {
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
    return asJson.items[0].content;
}

async function mapBiblicalCitationHtmlToCleanText(citationHtml, page) {
    return page.evaluate((html) => {
        // Create a temporary div element
        let tempDiv = document.createElement('div');
        // Set the innerHTML of the div to the provided HTML snippet
        tempDiv.innerHTML = html;
        [...tempDiv.querySelectorAll('a')].forEach(a => a.remove());
        // Access the textContent property of the div
        let textContent = tempDiv.textContent || tempDiv.innerText;
        // Clean up the temporary div
        tempDiv = null;
        return textContent;
    }, citationHtml);
}

/**
 * @param {string} linkHref
 * @param {Page} page
 * @returns {Promise<string>}
 */
async function fetchTooltipCitationText(linkHref, page) {
    const biblicalCitationHtml = await fetchBiblicalCitationHtml(linkHref);
    return mapBiblicalCitationHtmlToCleanText(biblicalCitationHtml, page);
}

/**
 * @typedef {Object} CitationLinkData
 * @property {string} linkText - Text that points to a citation (link's text).
 * @property {string} linkHref - The href attribute of the citation link.
 * @property {number} citeNum - Unique citation number.
 */

/**
 * @typedef {Object} BiblicalCitation
 * @property {string} citedText - The content's of the cited text.
 * @property {number} citeNum - Citations unique identifier number.
 * @property {CitationLinkData} linkData - Data about the link that generated this citation.
 */

/**
 * @param {ElementHandle} $citationContainer
 * @param {Page} page
 * @returns {Promise<BiblicalCitation[]>}
 */
async function buildTooltipBiblicalCitations($citationContainer, page) {
    let citations = /** @type {BiblicalCitation[]} */ [];

    const linksData = /** @type {CitationLinkData[]} */ await $citationContainer.$$eval(
        'a.b',
        els => Promise.all(
            els.map(
                citeLink => (/** @type {CitationLinkData} */ {
                    linkText: getTrimmedText(citeLink),
                    linkHref: citeLink.getAttribute('href'),
                    citeNum: Math.floor(Math.random() * 10000),
                })
            )
        )
    );

    for (const linkData of linksData) {
        const citedText = await fetchTooltipCitationText(linkData.linkHref, page);
        citations.push({
            citedText,
            citeNum: linkData.citeNum,
            linkData,
        });
    }

    return citations;
}

/**
 * @typedef {Object} TooltipCitationData
 * @property {number} citeNum - Citations unique identifier number.
 * @property {CitationLinkData} linkData - Data about the link that generated this citation.
 * @property {string} citedText - The content's of the cited text.
 * @property {string} linkTextWithRef - Text of the link hat generated this citation with markdown footnote reference.
 * @property {boolean} isBibleCitation - True if the tooltip citation showed a biblical scripture.
 * @property {boolean} isPublicationCitation - True if the tooltip citation showed a publication.
 * @property {BiblicalCitation[]} biblicalCitations - List of biblical citations found in the tooltip.
 */

/**
 * @param {ElementHandle} $citationLink
 * @param {Page} page
 * @returns {Promise<TooltipCitationData>}
 */
async function hoverAndGetTooltipCitationData($citationLink, page) {
    const tooltipContentSelector = '.tooltipContent';

    const linkData = /** @type {CitationLinkData} */ {
        linkText: await $citationLink.evaluate(getTrimmedText),
        linkHref: await $citationLink.evaluate(l => l.getAttribute('href')),
        citeNum: getNextCiteNum(),
    };

    await $citationLink.hover();
    await page.waitForSelector(tooltipContentSelector, {visible: true});

    const $citationContainer = await page.$(`${tooltipContentSelector} > *:first-child`);
    const isBibleCitation = await $citationContainer.evaluate(e => e.classList.contains('bibleCitation'));
    const isPublicationCitation = await $citationContainer.evaluate(e => e.classList.contains('publicationCitation'));

    let citedText = await extractElementText(tooltipContentSelector, page);
    if (isBibleCitation) {
        citedText = citedText.replace(/^\d+?\W/, '').replaceAll(/[+*]/g, '');
    }
    const biblicalCitations = /** @type {BiblicalCitation[]} */
        isBibleCitation ? [] : await buildTooltipBiblicalCitations($citationContainer, page);

    await page.click('.tooltipContainer .closeBtn');
    await page.waitForSelector(tooltipContentSelector, {hidden: true});

    return /** @type {TooltipCitationData} */ {
        citeNum: linkData.citeNum,
        linkData,
        citedText,
        linkTextWithRef: linkData.linkText + ` [^${linkData.citeNum}]`,
        isBibleCitation,
        isPublicationCitation,
        biblicalCitations,
    };
}

function getNextCiteNum() {
    return (getNextCiteNum.currentNumber += 1);
}

getNextCiteNum.currentNumber = 0;

/**
 * @typedef {Object} CitationData
 * @property {string} rawText - Text found as-is in the element that contains citation links.
 * @property {string} textWithRefsOnly - Modified version of `rawText` to include markdown footnote references (without cite content).
 * @property {string} textWithRefsAndFootNotes - Extended version of `textWithRefsOnly` that includes cite contents using markdown footnote references.
 * @property {string} textWithRefsAndFootNotes2Levels - Extended version of `textWithRefsAndFootNotes` here we include the citations made by the citations.
 * @property {TooltipCitationData[]} tooltipCitationsData - List of citation data extracted from in the tooltip(s).
 */

/**
 * @param {Page} page
 * @param {ElementHandle} $elementWithCitations
 * @param {ElementHandle[]} $citationLinks
 * @returns {Promise<CitationData>}
 */
export async function buildCitationData(page, $elementWithCitations, $citationLinks) {
    const rawText = await $elementWithCitations.evaluate(getTrimmedText);

    let tooltipCitationsData = [];
    for (const $citationLink of $citationLinks) {
        tooltipCitationsData.push(await hoverAndGetTooltipCitationData($citationLink, page));
    }

    const textWithRefsOnly = tooltipCitationsData.reduce((r, tcd) => r.replace(tcd.linkData.linkText, tcd.linkTextWithRef), rawText);
    const textWithRefsAndFootNotes = tooltipCitationsData.reduce(
        (r, tcd) => r + `[^${tcd.citeNum}]: ${tcd.citedText}\n`
        , textWithRefsOnly + '\n---\n'
    );
    const textWithRefsAndFootNotes2Levels = tooltipCitationsData.reduce(
        (r, tcd) => r + tcd.biblicalCitations.map(bc => `[^${bc.citeNum}]: ${bc.citedText}`).join('\n')
        , textWithRefsAndFootNotes
    );

    return {
        rawText,
        textWithRefsOnly,
        tooltipCitationsData,
        textWithRefsAndFootNotes,
        textWithRefsAndFootNotes2Levels,
    };
}

export async function waitForCookiesAndCloseIt(page) {
    await page.waitForSelector(`.lnc-firstRunPopup`);
    await page.click(`button.lnc-acceptCookiesButton`);
    await page.waitForSelector(`.lnc-firstRunPopup`, {hidden: true});
}

/**
 * Represents a paragraph within a section of the article.
 * @typedef {ParagraphContents} Paragraph
 * @property {TooltipCitationData[]} biblicalCitations - The text citations data.
 */

/**
 * Type definition for coverage type of paragraph in a question.
 * Only allows the values "single" or "double".
 * "single" indicates the question covers content from a single paragraph.
 * "double" indicates the question covers content from multiple paragraphs.
 * @typedef {'single' | 'double' | 'range'} TypeOfPCoverage
 */

/**
 * Describes a question that provokes thought or review about the article's content.
 * @typedef {Object} Question
 * @property {TypeOfPCoverage} typeOfPCoverage - Indicates the paragraph coverage type.
 * @property {string} pCovered - The paragraph(s) the question refers to.
 * @property {string} text - The question text.
 * @property {number} logicalQCount - The number of logical questions contained.
 * @property {number} letteredQCount - The number of sub questions labeled with letters.
 * @property {string[]} letteredQuestionTexts - Text of sub questions labeled with letters.
 * @property {string[]} references - Any references or notes related to the question.
 */

/**
 * Type representing the coverage of paragraphs related to the figure.
 * @typedef {Object} ParagraphReferenceData
 * @property {TypeOfPCoverage} typeOfPCoverage - The type of paragraph coverage.
 * @property {string[]} pCovered - An array of strings representing the paragraphs covered.
 */

/**
 * Defines a figure or image within an article section, including its description and related information.
 * @typedef {Object} Figure
 * @property {string} [imageAlt=] - A brief description of the image for accessibility purposes.
 * @property {string} [figcaptionText=] - The caption text providing context or information.
 * @property {string} relatedParagraphs - Text mentioning which paragraph(s) number(s) the figure relates to.
 * @property {ParagraphReferenceData|null} [paragraphReferenceData=null] - Reference data about paragraphs related to the figure, can be null or an object.
 * @property {string} [footnoteDescription=] - A detailed description of the figure's significance.
 */

/**
 * Contains additional informational content or sidebars related to a section's topic.
 * @typedef {Object} Supplement
 * @property {string} title - The title of the supplemental content.
 * @property {string[]} figures - An array of strings, each representing a reference to a figure or image.
 * @property {string} contents - The textual content providing in-depth information or perspectives.
 */

/**
 * Defines a section within an article, containing titles, paragraphs, and additional elements.
 * @typedef {Object} ArticleSection
 * @property {string} title - The title of the section.
 * @property {Paragraph[]} paragraphs - Paragraphs of content within the section.
 * @property {Question[]} questions - Questions related to the section content.
 * @property {Figure[]} figures - Figures or images included within the section.
 * @property {Supplement[]} supplements - Additional informational content related to the section.
 */

/**
 * @param {Page} page
 * @returns {Promise<ArticleSection[]>}
 */
export async function extractBodyInSections(page) {
    log.debug('extracting body data');
    const $sections = await page.$$(`.bodyTxt .section`);
    const sections = /** @type {ArticleSection[]} */ [];

    for (let i = 0; i < $sections.length; i++) {
        const $section = $sections[i];
        log.debug('scraping section %d of %d', i + 1, $sections.length);

        const $paragraphs = await $section.$$(`.sb`);
        const paragraphs = /** @type {Paragraph[]} */ [];

        for (let j = 0; j < $paragraphs.length; j++) {
            const $paragraph = $paragraphs[j];
            log.debug('scraping paragraph %d of %d', j + 1, $paragraphs.length);

            const $biblicalCitations = await $paragraph.$$(`a.b`);
            const biblicalCitations = await buildCitationData(page, $paragraph, $biblicalCitations);
            paragraphs.push({
                ...await $paragraph.evaluate(mapParagraphToObj),
                biblicalCitations,
            });
        }
        log.debug('paragraphs were extracted');

        const title = await $section.$eval(`h2`, getTrimmedText).catch(() => '');
        log.debug('title was extracted');

        const questions = /** @type {Question[]} */ await $section.$$eval(`.qu`, els => els.map(mapQuestionElToObj));
        log.debug('questions were extracted');

        const figures = /** @type {Figure[]} */ await $section.$$eval(`.pGroup > div[id*="f"] figure`, els => els.map(mapFigureElToObj));
        log.debug('figures were extracted');

        const supplements = /** @type {Supplement[]} */ await $section.$$eval(`.boxSupplement`, els => els.map(mapSupplementBoxElToObj));
        log.debug('supplements were extracted');

        sections.push({
            title,
            paragraphs,
            questions,
            figures,
            supplements,
        });
    }
    log.debug('sections were extracted');

    return sections;
}

