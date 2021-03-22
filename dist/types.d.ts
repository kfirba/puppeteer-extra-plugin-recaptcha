/// <reference path="../dist/puppeteer-mods.d.ts" />
/**
 * Extend window object with recaptcha things
 */
declare global {
    interface Window {
        __google_recaptcha_client?: boolean;
        ___grecaptcha_cfg?: {
            clients?: any;
        };
    }
}
export declare type RecaptchaPluginPageAdditions = {
    /** Attempt to find all reCAPTCHAs on this page. */
    findRecaptchas: () => Promise<FindRecaptchasResult>;
    getRecaptchaSolutions: (captchas: CaptchaInfo[], provider?: SolutionProvider) => Promise<GetSolutionsResult>;
    enterRecaptchaSolutions: (solutions: CaptchaSolution[]) => Promise<EnterRecaptchaSolutionsResult>;
    /** Attempt to detect and solve reCAPTCHAs on this page automatically. 🔮 */
    solveRecaptchas: () => Promise<SolveRecaptchasResult>;
};
export interface SolutionProvider {
    id?: string;
    token?: string;
    fn?: (captchas: CaptchaInfo[], token?: string) => Promise<GetSolutionsResult>;
}
export interface FindRecaptchasResult {
    captchas: CaptchaInfo[];
    error?: any;
}
export interface EnterRecaptchaSolutionsResult {
    solved: CaptchaSolved[];
    error?: any;
}
export interface GetSolutionsResult {
    solutions: CaptchaSolution[];
    error?: any;
}
export declare type SolveRecaptchasResult = FindRecaptchasResult & EnterRecaptchaSolutionsResult & GetSolutionsResult;
export declare type CaptchaVendor = 'recaptcha' | 'hcaptcha';
export interface CaptchaInfo {
    _vendor: CaptchaVendor;
    id?: string;
    widgetId?: number;
    sitekey?: string;
    s?: string;
    callback?: string | Function;
    hasResponseElement?: boolean;
    url?: string;
    display?: {
        size?: string;
        theme?: string;
        top?: string;
        left?: string;
        width?: string;
        height?: string;
    };
}
export interface CaptchaSolution {
    _vendor: CaptchaVendor;
    id?: string;
    provider?: string;
    providerCaptchaId?: string;
    text?: string;
    requestAt?: Date;
    responseAt?: Date;
    duration?: number;
    error?: string | Error;
    hasSolution?: boolean;
}
export interface CaptchaSolved {
    _vendor: CaptchaVendor;
    id?: string;
    responseElement?: boolean;
    responseCallback?: boolean;
    solvedAt?: Date;
    error?: string | Error;
    isSolved?: boolean;
}
export interface PluginOptions {
    visualFeedback: boolean;
    throwOnError: boolean;
    provider?: SolutionProvider;
}
export interface ContentScriptOpts {
    visualFeedback: boolean;
}
export interface ContentScriptData {
    solutions?: CaptchaSolution[];
}
