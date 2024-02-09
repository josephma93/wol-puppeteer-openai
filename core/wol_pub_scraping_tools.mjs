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

async function hoverAndGetTooltipText($cite, page) {
    await $cite.hover();
    await page.waitForSelector('.tooltipContent', {visible: true});
    const text = await extractElementText('.tooltipContent', page);
    await page.click('.tooltipContainer .closeBtn');
    await page.waitForSelector('.tooltipContent', {hidden: true});
    return text;
}

function getNextFootnoteNum() {
    return (getNextFootnoteNum.currentNumber += 1);
}

getNextFootnoteNum.currentNumber = 0;

function cleanupTooltipText(rawTooltipText) {
    const footnoteNum = getNextFootnoteNum();
    const text = rawTooltipText
        .replace(/^\d+?\W/, '')
        .replaceAll(/[+*]/g, '');

    return {
        text,
        footnoteNum,
    }
}

/**
 * @param {Page} page
 * @param {ElementHandle} $paragraph
 * @param {ElementHandle[]} $biblicalCitations
 */
async function addAndGetScriptureFootnotes(page, $paragraph, $biblicalCitations) {
    let paragraphFootnotes = [];
    for (const $biblicalCitation of $biblicalCitations) {
        const rawText = await hoverAndGetTooltipText($biblicalCitation, page);
        const footnoteData = cleanupTooltipText(rawText);
        await $biblicalCitation.evaluate(
            (cite, fnNum) => cite.innerText += ` [^${fnNum}]`,
            footnoteData.footnoteNum
        );
        paragraphFootnotes.push(footnoteData);
    }
    return paragraphFootnotes;
}

export async function waitForCookiesAndCloseIt(page) {
    await page.waitForSelector(`.lnc-firstRunPopup`);
    await page.click(`button.lnc-acceptCookiesButton`);
    await page.waitForSelector(`.lnc-firstRunPopup`, {hidden: true});
}

/**
 * Represents a paragraph's footnotes
 * @typedef {Object} ParagraphFootnote
 * @property {string} text - The footnote's contents.
 * @property {number} footnoteNum - The footnote number.
 */

/**
 * Represents a paragraph within a section of the article.
 * @typedef {ParagraphContents} Paragraph
 * @property {ParagraphFootnote[]} footnotes - The paragraph footnotes.
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
    /** @type {ArticleSection[]} */
    const sections = [];

    for (let i = 0; i < $sections.length; i++) {
        const $section = $sections[i];
        log.debug('scraping section %d of %d', i + 1, $sections.length);

        const $paragraphs = await $section.$$(`.sb`);
        /** @type {Paragraph[]} */ const paragraphs = [];

        for (let j = 0; j < $paragraphs.length; j++) {
            const $paragraph = $paragraphs[j];
            log.debug('scraping $paragraph %d of %d', j + 1, $paragraphs.length);

            const $biblicalCitations = await $paragraph.$$(`a.b`);
            const footnotes = await addAndGetScriptureFootnotes(page, $paragraph, $biblicalCitations);
            paragraphs.push({
                ...await $paragraph.evaluate(mapParagraphToObj),
                footnotes,
            });
        }
        log.debug('paragraphs were extracted');

        const title = await $section.$eval(`h2`, getTrimmedText).catch(() => '');
        log.debug('title was extracted');

        /** @type {Question[]} */ const questions = await $section.$$eval(`.qu`, els => els.map(mapQuestionElToObj));
        log.debug('questions were extracted');

        /** @type {Figure[]} */ const figures = await $section.$$eval(`.pGroup > div[id*="f"] figure`, els => els.map(mapFigureElToObj));
        log.debug('figures were extracted');

        /** @type {Supplement[]} */ const supplements = await $section.$$eval(`.boxSupplement`, els => els.map(mapSupplementBoxElToObj));
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

