"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecaptchaContentScript = exports.ContentScriptDefaultData = exports.ContentScriptDefaultOpts = void 0;
exports.ContentScriptDefaultOpts = {
    visualFeedback: true,
};
exports.ContentScriptDefaultData = {
    solutions: [],
};
/**
 * Content script for Recaptcha handling (runs in browser context)
 * @note External modules are not supported here (due to content script isolation)
 */
class RecaptchaContentScript {
    constructor(opts = exports.ContentScriptDefaultOpts, data = exports.ContentScriptDefaultData) {
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
exports.RecaptchaContentScript = RecaptchaContentScript;
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
//# sourceMappingURL=content.js.map