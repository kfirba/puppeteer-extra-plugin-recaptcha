"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerExtraPluginRecaptcha = exports.BuiltinSolutionProviders = void 0;
const puppeteer_extra_plugin_1 = require("puppeteer-extra-plugin");
const content_1 = require("./content");
const content_hcaptcha_1 = require("./content-hcaptcha");
const TwoCaptcha = __importStar(require("./provider/2captcha"));
exports.BuiltinSolutionProviders = [
    {
        id: TwoCaptcha.PROVIDER_ID,
        fn: TwoCaptcha.getSolutions,
    },
];
/**
 * A puppeteer-extra plugin to automatically detect and solve reCAPTCHAs.
 * @noInheritDoc
 */
class PuppeteerExtraPluginRecaptcha extends puppeteer_extra_plugin_1.PuppeteerExtraPlugin {
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
        let scriptSource = content_1.RecaptchaContentScript.toString();
        let scriptName = 'RecaptchaContentScript';
        if (vendor === 'hcaptcha') {
            scriptSource = content_hcaptcha_1.HcaptchaContentScript.toString();
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
            const builtinProvider = exports.BuiltinSolutionProviders.find((p) => p.id === (provider || {}).id);
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
        console.log('adding methods....');
        prop.findRecaptchas = async () => this.findRecaptchas(prop);
        prop.getRecaptchaSolutions = async (captchas, provider) => this.getRecaptchaSolutions(captchas, provider);
        prop.enterRecaptchaSolutions = async (solutions) => this.enterRecaptchaSolutions(prop, solutions);
        // Add convenience methods that wraps all others
        prop.solveRecaptchas = async () => this.solveRecaptchas(prop);
    }
    _addCustomMethodsToPage(page) {
        // Add custom page methods
        this._addCustomMethods(page);
        // Add custom methods to potential frames as well
        page.on('frameattached', (frame) => {
            if (!frame)
                return;
            this._addCustomMethods(frame);
        });
    }
    async onPageCreated(page) {
        this.debug('onPageCreated', page.url());
        // Make sure we can run our content script
        await page.setBypassCSP(true);
        this._addCustomMethodsToPage(page);
    }
    /** Add additions to already existing pages and frames */
    async onBrowser(browser) {
        const pages = await browser.pages();
        for (const page of pages) {
            this._addCustomMethodsToPage(page);
            for (const frame of page.mainFrame().childFrames()) {
                this._addCustomMethods(frame);
            }
        }
    }
}
exports.PuppeteerExtraPluginRecaptcha = PuppeteerExtraPluginRecaptcha;
/** Default export, PuppeteerExtraPluginRecaptcha  */
const defaultExport = (options) => {
    return new PuppeteerExtraPluginRecaptcha(options || {});
};
exports.default = defaultExport;
//# sourceMappingURL=index.js.map