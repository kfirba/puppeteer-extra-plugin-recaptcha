"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const index_1 = __importDefault(require("./index"));
const puppeteer_extra_1 = require("puppeteer-extra");
const PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
ava_1.default('will solve reCAPTCHAs', async (t) => {
    if (!process.env.TWOCAPTCHA_TOKEN) {
        t.truthy('foo');
        console.log('TWOCAPTCHA_TOKEN not set, skipping test.');
        return;
    }
    const puppeteer = puppeteer_extra_1.addExtra(require('puppeteer'));
    const recaptchaPlugin = index_1.default({
        provider: {
            id: '2captcha',
            token: process.env.TWOCAPTCHA_TOKEN,
        },
    });
    puppeteer.use(recaptchaPlugin);
    const browser = await puppeteer.launch({
        args: PUPPETEER_ARGS,
        headless: true,
    });
    const page = await browser.newPage();
    const url = 'https://www.google.com/recaptcha/api2/demo';
    await page.goto(url, { waitUntil: 'networkidle0' });
    const result = await page.solveRecaptchas();
    const { captchas, solutions, solved, error } = result;
    t.falsy(error);
    t.is(captchas.length, 1);
    t.is(solutions.length, 1);
    t.is(solved.length, 1);
    t.is(solved[0]._vendor, 'recaptcha');
    t.is(solved[0].isSolved, true);
    await browser.close();
});
ava_1.default('will solve hCAPTCHAs', async (t) => {
    if (!process.env.TWOCAPTCHA_TOKEN) {
        t.truthy('foo');
        console.log('TWOCAPTCHA_TOKEN not set, skipping test.');
        return;
    }
    const puppeteer = puppeteer_extra_1.addExtra(require('puppeteer'));
    const recaptchaPlugin = index_1.default({
        provider: {
            id: '2captcha',
            token: process.env.TWOCAPTCHA_TOKEN,
        },
    });
    puppeteer.use(recaptchaPlugin);
    const browser = await puppeteer.launch({
        args: PUPPETEER_ARGS,
        headless: true,
    });
    const page = await browser.newPage();
    const url = 'http://democaptcha.com/demo-form-eng/hcaptcha.html';
    await page.goto(url, { waitUntil: 'networkidle0' });
    const result = await page.solveRecaptchas();
    const { captchas, solutions, solved, error } = result;
    t.falsy(error);
    t.is(captchas.length, 1);
    t.is(solutions.length, 1);
    t.is(solved.length, 1);
    t.is(solved[0]._vendor, 'hcaptcha');
    t.is(solved[0].isSolved, true);
    await browser.close();
});
//# sourceMappingURL=solve.test.js.map