import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [sveltekit()],
    optimizeDeps: { exclude: ["libraw-wasm"] },
    server: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
        fs: {
            allow: ["../LibRaw-Wasm/dist/"],
        },
    },
    worker: {
        format: "es",
    },
});
