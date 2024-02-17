const puppeteer = require('puppeteer');

// ACTION='donation' DATE='16/2/2024' WORLD_WORK_AMOUNT='' CONGREGATION_AMOUNT='' SITEUSERNAME='' PASSWORD='' CODE='' node insert_s_24.js

(async () => {

    console.log('Starting browser...');
    const browser = await puppeteer.launch({
        headless: process.env.DEBUG ? false : 'new',
        args: ['--lang=es-CR,es'],
        slowMo: process.env.DEBUG ? 25 : undefined,
    });
    console.log('Browser launched.');

    const pages = await browser.pages();
    const page = pages[0];
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    try {
        console.log('Navigating to JW Hub...');
        await page.goto('https://hub.jw.org/');
        console.log('Page loaded.');

        console.log('Closing cookies...');
        try {
            await page.waitForSelector(`.lnc-firstRunPopup`, {visible: true});
            await page.click(`button.lnc-acceptCookiesButton`);
            await page.waitForSelector(`.lnc-firstRunPopup`, {hidden: true});
        } finally {
            console.log('Cookies closed.');
        }

        console.log('Entering username...');
        await page.waitForSelector('#username', {visible: true});
        console.log('Username field found.');
        await page.type('#username', process.env.SITEUSERNAME);
        await page.click('#submit-button');
        console.log('Username submitted.');

        console.log('Entering password...');
        await page.waitForSelector('#passwordInput', {visible: true});
        console.log('Password field found.');
        await page.type('#passwordInput', process.env.PASSWORD);
        await page.click(`#submit-button, #submitButton`);
        console.log('Password submitted.');

        console.log('Entering unique code...');
        await page.waitForSelector(`[id="form.code"]`, {visible: true});
        await page.type(`[id="form.code"]`, process.env.CODE);
        await page.click(`.button.button--primary`);
        console.log('Code submitted.');

        console.log('Navigating to specific section...');
        await page.waitForSelector('app-groups ul li:nth-child(3) ul.list li:nth-child(2) a', {visible: true});
        await page.click('app-groups ul li:nth-child(3) ul.list li:nth-child(2) a');
        console.log('Section accessed.');

        console.log('Performing action...');
        await page.waitForSelector('.button.button--action.button--has-icon', {visible: true});
        await page.click('.grid__item .button.button--action.button--has-icon');
        console.log('Action performed.');

        console.log('Navigating to transactions section...');
        await page.waitForSelector('app-transactions', {visible: true});
        console.log('In transactions section.');
        const action = process.env.ACTION;
        console.log(`Attempting action: ${action}`);
        switch (action) {
            case 'donation':
                await page.click('app-transactions .list li:nth-child(1) article');
                break;
            case 'deposit':
                await page.click('app-transactions .list li:nth-child(2) article');
                break;
            case 'payment':
                await page.click('app-transactions .list li:nth-child(3) article');
                break;
            case 'other':
                await page.click('app-transactions .list li:nth-child(4) article');
                break;
            default:
                console.error('Invalid action specified');
        }
        console.log('Transaction action selected.');

        console.log('Filling out form...');
        await page.waitForSelector('app-collected-contributions', {visible: true});
        const dateFieldSelector = 'input[id="form1.transactionDate"]';
        // await page.focus(dateFieldSelector);
        // await page.type(dateFieldSelector, process.env.DATE);
        // await page.click(dateFieldSelector);
        // await page.keyboard.press('Tab');
        // const simulateTyping = async (selector, value) => {
        //     await page.click(selector, {clickCount: 3}); // Focus and select existing value
        //     await page.keyboard.press('Backspace'); // Clear existing value
        //     for (let char of value) {
        //         await page.keyboard.press(char); // Simulate typing
        //         await new Promise(r => setTimeout(r, 50));
        //     }
        //     await page.keyboard.press('Tab');
        // };
        // await page.$eval(dateFieldSelector,
        //     (element, value) => {
        //         // format: d/m/yyyy (5/2/2024)
        //         element.value = value;
        //         element.dispatchEvent(new Event('change', {bubbles: true}));
        //         // element.dispatchEvent(new Event('input', { bubbles: true }));
        //         // element.dispatchEvent(new Event('blur', { bubbles: true }));
        //     },
        //     process.env.DATE
        // );
        // await simulateTyping(dateFieldSelector, process.env.DATE);
        /**
         * Clicks the correct date in the datepicker.
         * @param {puppeteer.Page} page Puppeteer Page object.
         * @param {string} dateString Date in d/m/yyyy format.
         */
        async function selectDate(dateString) {
            // Parse the provided date string
            const [day, ,] = dateString.split('/').map(num => parseInt(num, 10));

            await page.click(`[icon="calendar"]`);
            // Wait for the datepicker to become visible
            await page.waitForSelector('.datepicker__window', {visible: true});

            // Use page.evaluate to interact with the datepicker directly in the page context
            await page.evaluate((dayNum) => {
                // Find all selectable days in the datepicker
                const days = Array.from(document.querySelectorAll('.month__week-day--selectable'));
                const targetDay = days.find(d => parseInt(d.innerText.trim(), 10) === dayNum);
                if (targetDay) {
                    // Click the day that matches the target
                    targetDay.click();
                } else {
                    throw new Error(`Day ${dayNum} not found in the datepicker.`);
                }
            }, day);
        }

        await selectDate(process.env.DATE);
        const worldWorkSelector = 'input[id="form.contributions.0:0.amount"]';
        // await page.focus(worldWorkSelector);
        // await page.click(worldWorkSelector);
        await page.type(worldWorkSelector, process.env.WORLD_WORK_AMOUNT);
        await page.type('input[id="form.contributions.1:1.amount"]', process.env.CONGREGATION_AMOUNT);
        console.log('Form filled.');

        console.log('Going to next step...');
        await page.click('.button--primary');
        console.log('First step concluded.');

        await page.waitForSelector('app-attach-multi-file', {visible: true});
        console.log('Doing second step...');
        await page.click('.button--primary');
        console.log('Second step done.');

        console.log('Waiting for activity summary...');
        await page.waitForSelector('app-activity-summary', {visible: true});
        console.log('Activity summary displayed.');

    } catch (error) {
        console.error('An error occurred:', error.message);
        // Attempt to dump the current HTML to the console
        try {
            await page.$$eval(`svg`, svg => svg.forEach(e => e.remove()));
            const html = await page.content();
            console.log('Current HTML dump start.');
            console.log(html);
            console.log('Current HTML dump finish.');
        } catch (innerError) {
            console.error('Failed to dump HTML due to:', innerError.message);
        }
    } finally {
        console.log('Closing browser...');
        await browser.close();
        console.log('Browser closed. Process completed.');
    }
})();
