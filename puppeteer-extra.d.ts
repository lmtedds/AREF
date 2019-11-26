// There is no @types file so just hack around for the time being.
declare module "puppeteer-extra" {
    export function use(_: any): void;
    export function launch(_: any): Promise<any>;
}
