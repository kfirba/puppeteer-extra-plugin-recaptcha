/*!
 * puppeteer-extra-plugin-recaptcha v3.3.7 by berstend
 * https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-recaptcha
 * @license MIT
 */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var puppeteerExtraPlugin = require('puppeteer-extra-plugin');
var Debug = require('debug');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var Debug__default = /*#__PURE__*/_interopDefaultLegacy(Debug);

const ContentScriptDefaultOpts = {
    visualFeedback: true,
};
const ContentScriptDefaultData = {
    solutions: [],
};
/**
 * Content script for Recaptcha handling (runs in browser context)
 * @note External modules are not supported here (due to content script isolation)
 */
class RecaptchaContentScript {
    constructor(opts = ContentScriptDefaultOpts, data = ContentScriptDefaultData) {
        // Poor mans _.pluck
        this._pick = (props) => (o) => props.reduce((a, e) => (Object.assign(Object.assign({}, a), { [e]: o[e] })), {});
        // make sure the element is visible - this is equivalent to jquery's is(':visible')
        this._isVisible = (elem) => !!(elem.offsetWidth ||
            elem.offsetHeight ||
            (typeof elem.getClientRects === 'function' &&
                elem.getClientRects().length));
        this.opts = opts;
        this.data = data;
    }
    // Recaptcha client is a nested, circular object with object keys that seem generated
    // We flatten that object a couple of levels deep for easy access to certain keys we're interested in.
    _flattenObject(item, levels = 2, ignoreHTML = true) {
        const isObject = (x) => x && typeof x === 'object';
        const isHTML = (x) => x && x instanceof HTMLElement;
        let newObj = {};
        for (let i = 0; i < levels; i++) {
            item = Object.keys(newObj).length ? newObj : item;
            Object.keys(item).forEach((key) => {
                if (ignoreHTML && isHTML(item[key]))
                    return;
                if (isObject(item[key])) {
                    Object.keys(item[key]).forEach((innerKey) => {
                        if (ignoreHTML && isHTML(item[key][innerKey]))
                            return;
                        const keyName = isObject(item[key][innerKey])
                            ? `obj_${key}_${innerKey}`
                            : `${innerKey}`;
                        newObj[keyName] = item[key][innerKey];
                    });
                }
                else {
                    newObj[key] = item[key];
                }
            });
        }
        return newObj;
    }
    // Helper function to return an object based on a well known value
    _getKeyByValue(object, value) {
        return Object.keys(object).find((key) => object[key] === value);
    }
    async _waitUntilDocumentReady() {
        return new Promise(function (resolve) {
            if (!document || !window) {
                return resolve(null);
            }
            const loadedAlready = /^loaded|^i|^c/.test(document.readyState);
            if (loadedAlready) {
                return resolve(null);
            }
            function onReady() {
                resolve(null);
                document.removeEventListener('DOMContentLoaded', onReady);
                window.removeEventListener('load', onReady);
            }
            document.addEventListener('DOMContentLoaded', onReady);
            window.addEventListener('load', onReady);
        });
    }
    _paintCaptchaBusy($iframe) {
        try {
            if (this.opts.visualFeedback) {
                $iframe.style.filter = `opacity(60%) hue-rotate(400deg)`; // violet
            }
        }
        catch (error) {
            // noop
        }
        return $iframe;
    }
    _paintCaptchaSolved($iframe) {
        try {
            if (this.opts.visualFeedback) {
                $iframe.style.filter = `opacity(60%) hue-rotate(230deg)`; // green
            }
        }
        catch (error) {
            // noop
        }
        return $iframe;
    }
    _findVisibleIframeNodes() {
        return Array.from(document.querySelectorAll(`iframe[src^='https://www.google.com/recaptcha/api2/anchor'][name^="a-"]`
            + ', ' +
            `iframe[src^='https://www.google.com/recaptcha/enterprise/anchor'][name^="a-"]`));
    }
    _findVisibleIframeNodeById(id) {
        return document.querySelector(`iframe[src^='https://www.google.com/recaptcha/api2/anchor'][name^="a-${id || ''}"]`
            + ', ' +
            `iframe[src^='https://www.google.com/recaptcha/enterprise/anchor'][name^="a-${id || ''}"]`);
    }
    _hideChallengeWindowIfPresent(id) {
        let frame = document.querySelector(`iframe[src^='https://www.google.com/recaptcha/api2/bframe'][name^="c-${id || ''}"]`
            + ', ' +
            `iframe[src^='https://www.google.com/recaptcha/enterprise/bframe'][name^="c-${id || ''}"]`);
        if (!frame) {
            return;
        }
        while (frame &&
            frame.parentElement &&
            frame.parentElement !== document.body) {
            frame = frame.parentElement;
        }
        if (frame) {
            frame.style.visibility = 'hidden';
        }
    }
    getClients() {
        // Bail out early if there's no indication of recaptchas
        if (!window || !window.__google_recaptcha_client)
            return;
        if (!window.___grecaptcha_cfg || !window.___grecaptcha_cfg.clients) {
            return;
        }
        if (!Object.keys(window.___grecaptcha_cfg.clients).length)
            return;
        return window.___grecaptcha_cfg.clients;
    }
    getVisibleIframesIds() {
        // Find all regular visible recaptcha boxes through their iframes
        return this._findVisibleIframeNodes()
            .filter(($f) => this._isVisible($f))
            .map(($f) => this._paintCaptchaBusy($f))
            .filter(($f) => $f && $f.getAttribute('name'))
            .map(($f) => $f.getAttribute('name') || '') // a-841543e13666
            .map((rawId) => rawId.split('-').slice(-1)[0] // a-841543e13666 => 841543e13666
        )
            .filter((id) => id);
    }
    getInvisibleIframesIds() {
        // Find all invisible recaptcha boxes through their iframes (only the ones with an active challenge window)
        return this._findVisibleIframeNodes()
            .filter(($f) => $f && $f.getAttribute('name'))
            .map(($f) => $f.getAttribute('name') || '') // a-841543e13666
            .map((rawId) => rawId.split('-').slice(-1)[0] // a-841543e13666 => 841543e13666
        )
            .filter((id) => id)
            .filter((id) => document.querySelectorAll(`iframe[src^='https://www.google.com/recaptcha/api2/bframe'][name^="c-${id || ''}"]`
            + ', ' +
            `iframe[src^='https://www.google.com/recaptcha/enterprise/bframe'][name^="c-${id || ''}"]`).length);
    }
    getIframesIds() {
        // Find all recaptcha boxes through their iframes, check for invisible ones as fallback
        const results = [
            ...this.getVisibleIframesIds(),
            ...this.getInvisibleIframesIds(),
        ];
        // Deduplicate results by using the unique id as key
        return [...new Map(results.map((x) => [x.id, x])).values()];
    }
    getResponseInputById(id) {
        if (!id)
            return;
        const $iframe = this._findVisibleIframeNodeById(id);
        if (!$iframe)
            return;
        const $parentForm = $iframe.closest(`form`);
        if ($parentForm) {
            return $parentForm.querySelector(`[name='g-recaptcha-response']`);
        }
        // Not all reCAPTCHAs are in forms
        // https://github.com/berstend/puppeteer-extra/issues/57
        if (document && document.body) {
            return document.body.querySelector(`[name='g-recaptcha-response']`);
        }
    }
    getClientById(id) {
        if (!id)
            return;
        const clients = this.getClients();
        // Lookup captcha "client" info using extracted id
        let client = Object.values(clients || {})
            .filter((obj) => this._getKeyByValue(obj, id))
            .shift(); // returns first entry in array or undefined
        if (!client)
            return;
        client = this._flattenObject(client);
        client.widgetId = client.id;
        client.id = id;
        return client;
    }
    extractInfoFromClient(client) {
        if (!client)
            return;
        const info = this._pick(['sitekey', 'callback'])(client);
        if (!info.sitekey)
            return;
        info._vendor = 'recaptcha';
        info.id = client.id;
        info.s = client.s; // google site specific
        info.widgetId = client.widgetId;
        info.display = this._pick([
            'size',
            'top',
            'left',
            'width',
            'height',
            'theme',
        ])(client);
        // callbacks can be strings or funtion refs
        if (info.callback && typeof info.callback === 'function') {
            info.callback = info.callback.name || 'anonymous';
        }
        if (document && document.location)
            info.url = document.location.href;
        return info;
    }
    async findRecaptchas() {
        const result = {
            captchas: [],
            error: null,
        };
        try {
            await this._waitUntilDocumentReady();
            const clients = this.getClients();
            if (!clients)
                return result;
            result.captchas = this.getIframesIds()
                .map((id) => this.getClientById(id))
                .map((client) => this.extractInfoFromClient(client))
                .map((info) => {
                if (!info)
                    return;
                const $input = this.getResponseInputById(info.id);
                info.hasResponseElement = !!$input;
                return info;
            })
                .filter((info) => info);
        }
        catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }
    async enterRecaptchaSolutions() {
        const result = {
            solved: [],
            error: null,
        };
        try {
            await this._waitUntilDocumentReady();
            const clients = this.getClients();
            if (!clients) {
                result.error = 'No recaptchas found';
                return result;
            }
            const solutions = this.data.solutions;
            if (!solutions || !solutions.length) {
                result.error = 'No solutions provided';
                return result;
            }
            result.solved = this.getIframesIds()
                .map((id) => this.getClientById(id))
                .map((client) => {
                const solved = {
                    _vendor: 'recaptcha',
                    id: client.id,
                    responseElement: false,
                    responseCallback: false,
                };
                const $iframe = this._findVisibleIframeNodeById(solved.id);
                if (!$iframe) {
                    solved.error = `Iframe not found for id '${solved.id}'`;
                    return solved;
                }
                const solution = solutions.find((s) => s.id === solved.id);
                if (!solution || !solution.text) {
                    solved.error = `Solution not found for id '${solved.id}'`;
                    return solved;
                }
                // Hide if present challenge window
                this._hideChallengeWindowIfPresent(solved.id);
                // Enter solution in response textarea
                const $input = this.getResponseInputById(solved.id);
                if ($input) {
                    $input.innerHTML = solution.text;
                    solved.responseElement = true;
                }
                // Enter solution in optional callback
                if (client.callback) {
                    try {
                        if (typeof client.callback === 'function') {
                            client.callback.call(window, solution.text);
                        }
                        else {
                            eval(client.callback).call(window, solution.text); // tslint:disable-line
                        }
                        solved.responseCallback = true;
                    }
                    catch (error) {
                        solved.error = error;
                    }
                }
                // Finishing up
                solved.isSolved = solved.responseCallback || solved.responseElement;
                solved.solvedAt = new Date();
                this._paintCaptchaSolved($iframe);
                return solved;
            });
        }
        catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }
}
/*
// Example data

{
    "captchas": [{
        "sitekey": "6LdAUwoUAAAAAH44X453L0tUWOvx11XXXXXXXX",
        "id": "lnfy52r0cccc",
        "widgetId": 0,
        "display": {
            "size": null,
            "top": 23,
            "left": 13,
            "width": 28,
            "height": 28,
            "theme": null
        },
        "url": "https://example.com",
        "hasResponseElement": true
    }],
    "error": null
}

{
    "solutions": [{
        "id": "lnfy52r0cccc",
        "provider": "2captcha",
        "providerCaptchaId": "61109548000",
        "text": "03AF6jDqVSOVODT-wLKZ47U0UXz...",
        "requestAt": "2019-02-09T18:30:43.587Z",
        "responseAt": "2019-02-09T18:30:57.937Z"
    }]
    "error": null
}

{
    "solved": [{
        "id": "lnfy52r0cccc",
        "responseElement": true,
        "responseCallback": false,
        "isSolved": true,
        "solvedAt": {}
    }]
    "error": null
}
*/

const ContentScriptDefaultOpts$1 = {
    visualFeedback: true,
};
const ContentScriptDefaultData$1 = {
    solutions: [],
};
/**
 * Content script for Hcaptcha handling (runs in browser context)
 * @note External modules are not supported here (due to content script isolation)
 */
class HcaptchaContentScript {
    constructor(opts = ContentScriptDefaultOpts$1, data = ContentScriptDefaultData$1) {
        this.baseUrl = 'https://assets.hcaptcha.com/captcha/v1/';
        this.opts = opts;
        this.data = data;
    }
    async _waitUntilDocumentReady() {
        return new Promise(function (resolve) {
            if (!document || !window)
                return resolve(null);
            const loadedAlready = /^loaded|^i|^c/.test(document.readyState);
            if (loadedAlready)
                return resolve(null);
            function onReady() {
                resolve(null);
                document.removeEventListener('DOMContentLoaded', onReady);
                window.removeEventListener('load', onReady);
            }
            document.addEventListener('DOMContentLoaded', onReady);
            window.addEventListener('load', onReady);
        });
    }
    _paintCaptchaBusy($iframe) {
        try {
            if (this.opts.visualFeedback) {
                $iframe.style.filter = `opacity(60%) hue-rotate(400deg)`; // violet
            }
        }
        catch (error) {
            // noop
        }
        return $iframe;
    }
    /** Regular checkboxes */
    _findRegularCheckboxes() {
        const nodeList = document.querySelectorAll(`iframe[src^='${this.baseUrl}'][data-hcaptcha-widget-id]:not([src*='invisible'])`);
        return Array.from(nodeList);
    }
    /** Find active challenges from invisible hcaptchas */
    _findActiveChallenges() {
        const nodeList = document.querySelectorAll(`div[style*='visible'] iframe[src^='${this.baseUrl}'][src*='hcaptcha-challenge.html'][src*='invisible']`);
        return Array.from(nodeList);
    }
    _extractInfoFromIframes(iframes) {
        return iframes
            .map((el) => el.src.replace('.html#', '.html?'))
            .map((url) => {
            const { searchParams } = new URL(url);
            const result = {
                _vendor: 'hcaptcha',
                url: document.location.href,
                id: searchParams.get('id'),
                sitekey: searchParams.get('sitekey'),
                display: {
                    size: searchParams.get('size') || 'normal',
                },
            };
            return result;
        });
    }
    async findRecaptchas() {
        const result = {
            captchas: [],
            error: null,
        };
        try {
            await this._waitUntilDocumentReady();
            const iframes = [
                ...this._findRegularCheckboxes(),
                ...this._findActiveChallenges(),
            ];
            if (!iframes.length) {
                return result;
            }
            result.captchas = this._extractInfoFromIframes(iframes);
            iframes.forEach((el) => {
                this._paintCaptchaBusy(el);
            });
        }
        catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }
    async enterRecaptchaSolutions() {
        const result = {
            solved: [],
            error: null,
        };
        try {
            await this._waitUntilDocumentReady();
            const solutions = this.data.solutions;
            if (!solutions || !solutions.length) {
                result.error = 'No solutions provided';
                return result;
            }
            result.solved = solutions
                .filter((solution) => solution._vendor === 'hcaptcha')
                .filter((solution) => solution.hasSolution === true)
                .map((solution) => {
                window.postMessage(JSON.stringify({
                    id: solution.id,
                    label: 'challenge-closed',
                    source: 'hcaptcha',
                    contents: {
                        event: 'challenge-passed',
                        expiration: 120,
                        response: solution.text,
                    },
                }), '*');
                return {
                    _vendor: solution._vendor,
                    id: solution.id,
                    isSolved: true,
                    solvedAt: new Date(),
                };
            });
        }
        catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }
}

// https://github.com/bochkarev-artem/2captcha/blob/master/index.js
// TODO: Create our own API wrapper
var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');
var apiKey;
var apiInUrl = 'http://2captcha.com/in.php';
var apiResUrl = 'http://2captcha.com/res.php';
var SOFT_ID = '2589';
var defaultOptions = {
    pollingInterval: 2000,
    retries: 3
};
function pollCaptcha(captchaId, options, invalid, callback) {
    invalid = invalid.bind({ options: options, captchaId: captchaId });
    var intervalId = setInterval(function () {
        var httpRequestOptions = url.parse(apiResUrl +
            '?action=get&soft_id=' +
            SOFT_ID +
            '&key=' +
            apiKey +
            '&id=' +
            captchaId);
        var request = http.request(httpRequestOptions, function (response) {
            var body = '';
            response.on('data', function (chunk) {
                body += chunk;
            });
            response.on('end', function () {
                if (body === 'CAPCHA_NOT_READY') {
                    return;
                }
                clearInterval(intervalId);
                var result = body.split('|');
                if (result[0] !== 'OK') {
                    callback(result[0]); //error
                }
                else {
                    callback(null, {
                        id: captchaId,
                        text: result[1]
                    }, invalid);
                }
                callback = function () { }; // prevent the callback from being called more than once, if multiple http requests are open at the same time.
            });
        });
        request.on('error', function (e) {
            request.destroy();
            callback(e);
        });
        request.end();
    }, options.pollingInterval || defaultOptions.pollingInterval);
}
const setApiKey = function (key) {
    apiKey = key;
};
const decodeReCaptcha = function (captchaMethod, captcha, pageUrl, extraData, options, callback) {
    if (!callback) {
        callback = options;
        options = defaultOptions;
    }
    var httpRequestOptions = url.parse(apiInUrl);
    httpRequestOptions.method = 'POST';
    var postData = Object.assign({ method: captchaMethod, key: apiKey, soft_id: SOFT_ID, 
        // googlekey: captcha,
        pageurl: pageUrl }, extraData);
    if (captchaMethod === 'userrecaptcha') {
        postData.googlekey = captcha;
    }
    if (captchaMethod === 'hcaptcha') {
        postData.sitekey = captcha;
    }
    postData = querystring.stringify(postData);
    var request = http.request(httpRequestOptions, function (response) {
        var body = '';
        response.on('data', function (chunk) {
            body += chunk;
        });
        response.on('end', function () {
            var result = body.split('|');
            if (result[0] !== 'OK') {
                return callback(result[0]);
            }
            pollCaptcha(result[1], options, function (error) {
                var callbackToInitialCallback = callback;
                report(this.captchaId);
                if (error) {
                    return callbackToInitialCallback('CAPTCHA_FAILED');
                }
                if (!this.options.retries) {
                    this.options.retries = defaultOptions.retries;
                }
                if (this.options.retries > 1) {
                    this.options.retries = this.options.retries - 1;
                    decodeReCaptcha(captchaMethod, captcha, pageUrl, extraData, this.options, callback);
                }
                else {
                    callbackToInitialCallback('CAPTCHA_FAILED_TOO_MANY_TIMES');
                }
            }, callback);
        });
    });
    request.on('error', function (e) {
        request.destroy();
        callback(e);
    });
    request.write(postData);
    request.end();
};
const report = function (captchaId) {
    var reportUrl = apiResUrl +
        '?action=reportbad&soft_id=' +
        SOFT_ID +
        '&key=' +
        apiKey +
        '&id=' +
        captchaId;
    var options = url.parse(reportUrl);
    var request = http.request(options, function (response) {
        // var body = ''
        // response.on('data', function(chunk) {
        //   body += chunk
        // })
        // response.on('end', function() {})
    });
    request.end();
};

const PROVIDER_ID = '2captcha';
const debug = Debug__default['default'](`puppeteer-extra-plugin:recaptcha:${PROVIDER_ID}`);
const secondsBetweenDates = (before, after) => (after.getTime() - before.getTime()) / 1000;
async function decodeRecaptchaAsync(token, vendor, sitekey, url, extraData, opts = { pollingInterval: 2000 }) {
    return new Promise((resolve) => {
        const cb = (err, result, invalid) => resolve({ err, result, invalid });
        try {
            setApiKey(token);
            let method = 'userrecaptcha';
            if (vendor === 'hcaptcha') {
                method = 'hcaptcha';
            }
            decodeReCaptcha(method, sitekey, url, extraData, opts, cb);
        }
        catch (error) {
            return resolve({ err: error });
        }
    });
}
async function getSolutions(captchas = [], token) {
    const solutions = await Promise.all(captchas.map((c) => getSolution(c, token || '')));
    return { solutions, error: solutions.find((s) => !!s.error) };
}
async function getSolution(captcha, token) {
    const solution = {
        _vendor: captcha._vendor,
        provider: PROVIDER_ID,
    };
    try {
        if (!captcha || !captcha.sitekey || !captcha.url || !captcha.id) {
            throw new Error('Missing data in captcha');
        }
        solution.id = captcha.id;
        solution.requestAt = new Date();
        debug('Requesting solution..', solution);
        const extraData = {};
        if (captcha.s) {
            extraData['data-s'] = captcha.s; // google site specific property
        }
        const { err, result, invalid } = await decodeRecaptchaAsync(token, captcha._vendor, captcha.sitekey, captcha.url, extraData);
        debug('Got response', { err, result, invalid });
        if (err)
            throw new Error(`${PROVIDER_ID} error: ${err}`);
        if (!result || !result.text || !result.id) {
            throw new Error(`${PROVIDER_ID} error: Missing response data: ${result}`);
        }
        solution.providerCaptchaId = result.id;
        solution.text = result.text;
        solution.responseAt = new Date();
        solution.hasSolution = !!solution.text;
        solution.duration = secondsBetweenDates(solution.requestAt, solution.responseAt);
    }
    catch (error) {
        debug('Error', error);
        solution.error = error.toString();
    }
    return solution;
}

const BuiltinSolutionProviders = [
    {
        id: PROVIDER_ID,
        fn: getSolutions,
    },
];
/**
 * A puppeteer-extra plugin to automatically detect and solve reCAPTCHAs.
 * @noInheritDoc
 */
class PuppeteerExtraPluginRecaptcha extends puppeteerExtraPlugin.PuppeteerExtraPlugin {
    constructor(opts) {
        super(opts);
        this.debug('Initialized', this.opts);
    }
    get name() {
        return 'recaptcha';
    }
    get defaults() {
        return {
            visualFeedback: true,
            throwOnError: false,
        };
    }
    get contentScriptOpts() {
        const { visualFeedback } = this.opts;
        return {
            visualFeedback,
        };
    }
    _generateContentScript(vendor, fn, data) {
        this.debug('_generateContentScript', vendor, fn, data);
        let scriptSource = RecaptchaContentScript.toString();
        let scriptName = 'RecaptchaContentScript';
        if (vendor === 'hcaptcha') {
            scriptSource = HcaptchaContentScript.toString();
            scriptName = 'HcaptchaContentScript';
        }
        return `(async() => {
      const DATA = ${JSON.stringify(data || null)}
      const OPTS = ${JSON.stringify(this.contentScriptOpts)}

      ${scriptSource}
      const script = new ${scriptName}(OPTS, DATA)
      return script.${fn}()
    })()`;
    }
    async findRecaptchas(page) {
        this.debug('findRecaptchas');
        // As this might be called very early while recaptcha is still loading
        // we add some extra waiting logic for developer convenience.
        const hasRecaptchaScriptTag = await page.$(`script[src*="/recaptcha/api.js"]`);
        this.debug('hasRecaptchaScriptTag', !!hasRecaptchaScriptTag);
        if (hasRecaptchaScriptTag) {
            this.debug('waitForRecaptchaClient - start', new Date());
            await page.waitForFunction(`
        (function() {
          return window.___grecaptcha_cfg && window.___grecaptcha_cfg.count
        })()
      `, { polling: 200, timeout: 10 * 1000 });
            this.debug('waitForRecaptchaClient - end', new Date()); // used as timer
        }
        const hasHcaptchaScriptTag = await page.$(`script[src*="//hcaptcha.com/1/api.js"]`);
        this.debug('hasHcaptchaScriptTag', !!hasHcaptchaScriptTag);
        if (hasHcaptchaScriptTag) {
            this.debug('wait:hasHcaptchaScriptTag - start', new Date());
            await page.waitForFunction(`
        (function() {
          return window.hcaptcha
        })()
      `, { polling: 200, timeout: 10 * 1000 });
            this.debug('wait:hasHcaptchaScriptTag - end', new Date()); // used as timer
        }
        // Even without a recaptcha script tag we're trying, just in case.
        const resultRecaptcha = (await page.evaluate(this._generateContentScript('recaptcha', 'findRecaptchas')));
        const resultHcaptcha = (await page.evaluate(this._generateContentScript('hcaptcha', 'findRecaptchas')));
        const response = {
            captchas: [...resultRecaptcha.captchas, ...resultHcaptcha.captchas],
            error: resultRecaptcha.error || resultHcaptcha.error,
        };
        this.debug('findRecaptchas', response);
        if (this.opts.throwOnError && response.error) {
            throw new Error(response.error);
        }
        return response;
    }
    async getRecaptchaSolutions(captchas, provider) {
        this.debug('getRecaptchaSolutions');
        provider = provider || this.opts.provider;
        if (!provider ||
            (!provider.token && !provider.fn) ||
            (provider.token && provider.token === 'XXXXXXX' && !provider.fn)) {
            throw new Error('Please provide a solution provider to the plugin.');
        }
        let fn = provider.fn;
        if (!fn) {
            const builtinProvider = BuiltinSolutionProviders.find((p) => p.id === (provider || {}).id);
            if (!builtinProvider || !builtinProvider.fn) {
                throw new Error(`Cannot find builtin provider with id '${provider.id}'.`);
            }
            fn = builtinProvider.fn;
        }
        const response = await fn.call(this, captchas, provider.token);
        response.error =
            response.error ||
                response.solutions.find((s) => !!s.error);
        this.debug('getRecaptchaSolutions', response);
        if (response && response.error) {
            console.warn('PuppeteerExtraPluginRecaptcha: An error occured during "getRecaptchaSolutions":', response.error);
        }
        if (this.opts.throwOnError && response.error) {
            throw new Error(response.error);
        }
        return response;
    }
    async enterRecaptchaSolutions(page, solutions) {
        this.debug('enterRecaptchaSolutions', { solutions });
        const hasRecaptcha = !!solutions.find((s) => s._vendor === 'recaptcha');
        const solvedRecaptcha = hasRecaptcha
            ? (await page.evaluate(this._generateContentScript('recaptcha', 'enterRecaptchaSolutions', {
                solutions,
            })))
            : { solved: [] };
        const hasHcaptcha = !!solutions.find((s) => s._vendor === 'hcaptcha');
        const solvedHcaptcha = hasHcaptcha
            ? (await page.evaluate(this._generateContentScript('hcaptcha', 'enterRecaptchaSolutions', {
                solutions,
            })))
            : { solved: [] };
        const response = {
            solved: [...solvedRecaptcha.solved, ...solvedHcaptcha.solved],
            error: solvedRecaptcha.error || solvedHcaptcha.error,
        };
        response.error = response.error || response.solved.find((s) => !!s.error);
        this.debug('enterRecaptchaSolutions', response);
        if (this.opts.throwOnError && response.error) {
            throw new Error(response.error);
        }
        return response;
    }
    async solveRecaptchas(page) {
        this.debug('solveRecaptchas');
        const response = {
            captchas: [],
            solutions: [],
            solved: [],
            error: null,
        };
        try {
            // If `this.opts.throwOnError` is set any of the
            // following will throw and abort execution.
            const { captchas, error: captchasError } = await this.findRecaptchas(page);
            response.captchas = captchas;
            if (captchas.length) {
                const { solutions, error: solutionsError, } = await this.getRecaptchaSolutions(response.captchas);
                response.solutions = solutions;
                const { solved, error: solvedError, } = await this.enterRecaptchaSolutions(page, response.solutions);
                response.solved = solved;
                response.error = captchasError || solutionsError || solvedError;
            }
        }
        catch (error) {
            response.error = error.toString();
        }
        this.debug('solveRecaptchas', response);
        if (this.opts.throwOnError && response.error) {
            throw new Error(response.error);
        }
        return response;
    }
    _addCustomMethods(prop) {
        prop.findRecaptchas = async () => this.findRecaptchas(prop);
        prop.getRecaptchaSolutions = async (captchas, provider) => this.getRecaptchaSolutions(captchas, provider);
        prop.enterRecaptchaSolutions = async (solutions) => this.enterRecaptchaSolutions(prop, solutions);
        // Add convenience methods that wraps all others
        prop.solveRecaptchas = async () => this.solveRecaptchas(prop);
    }
    async onPageCreated(page) {
        this.debug('onPageCreated', page.url());
        // Make sure we can run our content script
        await page.setBypassCSP(true);
        // Add custom page methods
        this._addCustomMethods(page);
        // Add custom methods to potential frames as well
        page.on('frameattached', (frame) => {
            if (!frame)
                return;
            this._addCustomMethods(frame);
        });
    }
    /** Add additions to already existing pages and frames */
    async onBrowser(browser) {
        const pages = await browser.pages();
        for (const page of pages) {
            this._addCustomMethods(page);
            for (const frame of page.mainFrame().childFrames()) {
                this._addCustomMethods(frame);
            }
        }
    }
}
/** Default export, PuppeteerExtraPluginRecaptcha  */
const defaultExport = (options) => {
    return new PuppeteerExtraPluginRecaptcha(options || {});
};

exports.BuiltinSolutionProviders = BuiltinSolutionProviders;
exports.PuppeteerExtraPluginRecaptcha = PuppeteerExtraPluginRecaptcha;
exports.default = defaultExport;


  module.exports = exports.default || {}
  Object.entries(exports).forEach(([key, value]) => { module.exports[key] = value })
//# sourceMappingURL=index.cjs.js.map
