<script lang="ts">
    import LibRaw from "libraw-wasm";
    import { onMount } from "svelte";
    const imageFile = "/test.DNG";

    onMount(async () => {
        const arrayBuffer = await fetch(imageFile).then((res) => res.arrayBuffer());
        console.log("Fetched image file:", arrayBuffer);
        const output = document.getElementById("output")!;
        // Instantiate LibRaw
        const raw = new LibRaw();
        // Open (decode) the RAW file
        await raw.open(new Uint8Array(arrayBuffer), {
            /* settings */
        });

        // Fetch metadata
        const meta = await raw.metadata(/* fullOutput=false */);
        console.log("Metadata:", meta);
        output.innerText = JSON.stringify(meta, null, 4);

        // Fetch the decoded image data (RGB pixels)
        const imageData = await raw.imageData();
        console.log("Image data:", imageData);
        // draw on canvas
        // Object { height: 2170, width: 3856, colors: 3, bits: 8, dataSize: 25102560, data: Uint8Array(25102560) }
        const canvas = document.getElementById("imageDebayered") as HTMLCanvasElement;
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get canvas context");
        }

        // Convert RGB to RGBA
        const rgb = new Uint8ClampedArray(imageData.data);
        const rgba = new Uint8ClampedArray(imageData.width * imageData.height * 4);
        for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
            rgba[j] = rgb[i]; // R
            rgba[j + 1] = rgb[i + 1]; // G
            rgba[j + 2] = rgb[i + 2]; // B
            rgba[j + 3] = 255; // A
        }
        const imageDataObj = new ImageData(rgba, imageData.width, imageData.height);
        ctx.putImageData(imageDataObj, 0, 0);
        console.log("Image drawn on canvas");

        // Fetch the raw image data (Bayer pattern)
        const rawImageData = await raw.rawImageData();
        console.log("Raw image data:", rawImageData);
        // draw on canvas
        const rawCanvas = document.getElementById("imageRaw") as HTMLCanvasElement;
        rawCanvas.width = rawImageData.width;
        rawCanvas.height = rawImageData.height;
        const rawCtx = rawCanvas.getContext("2d");
        if (!rawCtx) {
            throw new Error("Failed to get raw canvas context");
        }
        // convert grayscale to RGBA with normalization
        const rawData = rawImageData.data;
        // Find min and max for normalization
        let min = 65535,
            max = 0;
        for (let i = 0; i < rawData.length; i++) {
            if (rawData[i] < min) min = rawData[i];
            if (rawData[i] > max) max = rawData[i];
        }
        console.log(`Raw min: ${min}, max: ${max}`);
        // Normalize to 0-255
        const rawRgb = new Uint8ClampedArray(rawData.length * 4);
        for (let i = 0, j = 0; i < rawData.length; i++, j += 4) {
            const norm = max > min ? Math.round(((rawData[i] - min) * 255) / (max - min)) : 0;
            rawRgb[j] = norm; // R
            rawRgb[j + 1] = norm; // G
            rawRgb[j + 2] = norm; // B
            rawRgb[j + 3] = 255; // A
        }
        const rawImageDataObj = new ImageData(rawRgb, rawImageData.width, rawImageData.height);
        rawCtx.putImageData(rawImageDataObj, 0, 0);
        console.log("Raw image drawn on canvas");
    });
</script>

<div id="output"></div>
<canvas id="imageRaw" />
<canvas id="imageDebayered" />

<style>
    #output {
        white-space: pre-wrap;
        font-family: monospace;
        margin-bottom: 20px;
    }

    canvas {
        border: 1px solid black;
        max-height: 100vh;
        max-width: 100%;
    }
</style>
