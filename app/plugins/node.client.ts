import { Buffer } from "buffer";

export default defineNuxtPlugin((nuxtApp) => {
    // @ts-ignore
    globalThis.Buffer = Buffer
    // @ts-ignore
    window.Buffer = Buffer
})
