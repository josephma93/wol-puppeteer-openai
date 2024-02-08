const puppeteer = require('puppeteer');

async function extractArticleContents(page) {
    await page.waitForSelector(`#article`);
    // Define and inject the global methods
    await page.evaluate(
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

    const articleNum = await extractElementText('#p1', page);
    const title = await extractElementText('#p2', page);
    const mainCite = await extractElementText('#p3', page);
    const preview = await extractFootnoteContent('#p5 .fn');
    const subTitles = await extractTextFromElements('.section > h2', page);
    const body = await extractBodyInSections();
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

    /**
     * @param {string} txt
     * @returns {string}
     */
    function cleanText(txt) {
        return (typeof txt === 'string' ? txt : '').trim().replaceAll(' ', ' ');
    }

    /**
     * @param {HTMLElement} el
     * @returns {string}
     */
    function getTrimmedText(el) {
        return cleanText(el?.innerText ?? el?.textContent);
    }

    /**
     * @param {string} selector
     * @param context
     * @returns {Promise<string>}
     */
    function extractElementText(selector, context) {
        return context.$eval(selector, getTrimmedText);
    }

    /**
     * @param {string} selector
     * @param context
     * @returns {Promise<string[]>}
     */
    function extractTextFromElements(selector, context) {
        return context.$$eval(selector, (els) => els.map(getTrimmedText));
    }

    /**
     * @param {string} selector
     * @returns {Promise<string>}
     */
    async function extractFootnoteContent(selector) {
        const fnId = await page.$eval(selector, el => el.getAttribute('data-fnid'));
        return extractElementText(`#footnote${fnId}`, page).then(text => text.slice(2));
    }

    /**
     * @param {HTMLElement} p
     */
    async function mapParagraphToObj(p) {
        const parNum = getTrimmedText(p.querySelector('.parNum sup'));

        const biblicalCitations = Array.from(p.querySelectorAll('a.b'));

        // Transform citations onto markdown-style footnotes
        await (async function addFootnoteRefs(/** @type {HTMLElement[]} */ bcs) {

            /**
             * @param {string} selector
             * @param {number} searchType - Search type: 1 for getElementById, 2 for querySelector, 3 for jQuery.
             * @returns {Element|jQuery}
             */
            function findElement(selector, searchType) {
                switch (searchType) {
                    case 1:
                        return document.getElementById(selector);
                    case 2:
                        return document.querySelector(selector);
                    case 3:
                        return $(selector);
                    default:
                        throw new Error("Invalid search type");
                }
            }

            const domRefs = {
                _cache: {},
                /**
                 * @param {string} selector
                 * @param {number} searchType - Search type: 1 for getElementById, 2 for querySelector, 3 for jQuery.
                 * @returns {Element|jQuery}
                 */
                getFromCache(selector, searchType) {
                    if (!this._cache[selector]) {
                        this._cache[selector] = findElement(selector, searchType);
                    }
                    console.debug('Resolving from cache', this._cache[selector]);
                    return this._cache[selector];
                },
                get regionMain() {
                    return this.getFromCache('regionMain', 1);
                },
                get tooltipContainer() {
                    return findElement('.tooltipContainer', 2);
                },
                get tooltipContent() {
                    return findElement('.tooltipContent', 3);
                },
                get tooltipCloseBtn() {
                    return findElement('.tooltipContainer .closeBtn', 3);
                }
            };

            /**
             * @param {Element} elementToObserve
             * @param {number} [timeout=2000]
             * @returns {Promise<void>}
             */
            function observeElement(elementToObserve, timeout = 2000) {
                let observer;
                let timeoutId;

                const observerPromise = new Promise((resolve) => {
                    observer = new MutationObserver((mutationsList) => {
                        for (const mutation of mutationsList) {
                            if (mutation.type === 'childList') {
                                observer.disconnect();
                                clearTimeout(timeoutId);
                                console.debug('DOM change detected');
                                resolve();
                            }
                        }
                    });

                    observer.observe(elementToObserve, {childList: true});
                });

                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        console.debug('Timeout reached');
                        observer?.disconnect();
                        reject(new Error('MutationObserver timeout exceeded'));
                    }, timeout);
                });

                return Promise.race([observerPromise, timeoutPromise]);
            }

            /**
             * @returns {Promise<HTMLElement>}
             */
            async function waitForTooltip() {
                console.debug('Waiting for tooltip to open');
                await observeElement(domRefs.regionMain);
                return domRefs.tooltipContainer;
            }

            /**
             * @returns {Promise<HTMLElement>}
             */
            async function waitForTooltipClosure() {
                console.debug('Waiting for tooltip to close');
                await observeElement(domRefs.regionMain);
            }

            /**
             * @param {HTMLAnchorElement} pubRefElem
             */
            async function triggerTooltipToOpen(pubRefElem) {
                pubRefElem.dispatchEvent(new Event('pointerover'));
                await waitForTooltip();
                console.debug('Tooltip is open now');
            }

            /**
             * @returns {string}
             */
            function grabTooltipText() {
                // Remove references to other texts (+, * and other characters) in biblical references
                domRefs.tooltipContent?.find('a.b, a.fn').remove();
                return domRefs.tooltipContent?.text().trim();
            }

            /**
             * @param {HTMLElement} pubRefElem
             */
            async function triggerTooltipToClose() {
                domRefs.tooltipCloseBtn.click();
                await waitForTooltipClosure();
            }

            /**
             * @param {Element} pubRefElem
             * @returns {Promise<string>}
             */
            async function hoverAndGetTooltipText(pubRefElem) {
                await triggerTooltipToOpen(pubRefElem);
                const tooltipText = grabTooltipText();
                await triggerTooltipToClose();
                return tooltipText;
            }


            let textToAppend = '';
            for (const linkToBiblicalCitation of bcs) {
                const tooltipText = await hoverAndGetTooltipText(linkToBiblicalCitation);
                textToAppend += `[^${window.footnoteIndex}]: ${tooltipText}\n\n`;
                linkToBiblicalCitation.innerText += ` [^${window.footnoteIndex}]`;
                window.footnoteIndex++;
            }
            p.innerText += '\n\n---\n' + textToAppend;
        })(biblicalCitations);

        return {
            parNum: parNum ? parNum : "1",
            text: getTrimmedText(p).replace(`${parNum} `, ''),
        };
    }

    /**
     * @param {HTMLElement} el
     */
    function mapQuestionElToObj(el) {

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
    function mapFigureElToObj(figure) {
        const img = figure.querySelector('img');
        const figcaption = figure.querySelector('figcaption');

        let imageAlt = cleanText(img.alt);
        let figcaptionText = getTrimmedText(figcaption);
        let relatedParagraphs = [...figcaptionText.matchAll(/\(([^)]+)\)/g)].map(match => match[1]).pop() ?? '';
        let paragraphReferenceData = null;
        if (relatedParagraphs) {
            const execResult = /párrafos?\s(\d+)(?:\s([ya])\s(\d+))?/g.exec(relatedParagraphs);
            if (execResult) {
                const [,num1,separator,num2] = execResult;
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
    function mapSupplementBoxElToObj(box) {
        let title = getTrimmedText(box.querySelector('.boxTtl'));
        let figures = [...box.querySelectorAll('figure img')].map(img => cleanText(img.alt));
        let contents = getTrimmedText(box.querySelector('.boxContent'));

        return {
            title,
            figures,
            contents,
        };
    }

    async function extractBodyInSections() {
        const $sections = await page.$$(`.bodyTxt .section`);
        const extractedSectionTexts = [];

        for (const $section of $sections) {
            const title = await $section.$eval(`h2`, getTrimmedText).catch(() => '');
            const paragraphs = await $section.$$eval(`.sb`, els => Promise.all(els.map(mapParagraphToObj)));
            const questions = await $section.$$eval(`.qu`, els => els.map(mapQuestionElToObj));
            const figures = await $section.$$eval(`div[id*="f"].north_center figure`, els => els.map(mapFigureElToObj));
            const supplements = await $section.$$eval(`.boxSupplement`, els => els.map(mapSupplementBoxElToObj));
            extractedSectionTexts.push({title, paragraphs, questions, figures, supplements});
        }

        return extractedSectionTexts;
    }

    async function extractTeachBlock() {
        const title = await extractElementText('.blockTeach.rule .boxTtl', page);
        const listItems = await extractTextFromElements('.blockTeach.rule ul li', page);
        return {title, listItems};
    }
}

async function buildHomePage(page) {
    const todayLink = '#menuToday';
    const thisWeekWatchtowerArticle = '.todayItems .todayItem.pub-w .it';

    return {
        async goToTodayPage() {
            await page.waitForSelector(todayLink);
            await page.click(todayLink);
            await page.waitForNavigation();
        },
        async goToThisWeekWatchtowerArticle() {
            await page.waitForSelector(thisWeekWatchtowerArticle);
            await page.click(thisWeekWatchtowerArticle);
            await page.waitForNavigation();
        }
    }
}


(async () => {
    // Determine headless mode based on environment variable
    const headlessMode = !process.env.PUPPETEER_HEADLESS_MODE ? 'new' : false;

    // Launch browser with headless mode configured by environment variable
    const browser = await puppeteer.launch({
        headless: headlessMode,
        args: ['--lang=es-CR,es'],
    });

    const pages = await browser.pages();
    const page = pages[0];
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    if (process.env.SPECIFIC_ARTICLE_URL) {
        await page.goto(process.env.SPECIFIC_ARTICLE_URL);
        await page.waitForNavigation();
    } else {
        await page.goto(`https://wol.jw.org/es/`);
        const home = await buildHomePage(page);
        await home.goToTodayPage();
        await home.goToThisWeekWatchtowerArticle();
    }

    const articleContents = await extractArticleContents(page);
    console.log(JSON.stringify(articleContents, null, 4));
    await browser.close();
})();

