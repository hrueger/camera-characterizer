<script lang="ts">
    import { onMount } from "svelte";
    import { Matrix } from "ml-matrix";
    import { processImageFile } from "$lib";
    import { logCanvasPixelPosition } from "$lib/canvas";
    import { downloadFLSpace } from "$lib/flspace";

    let imageFile: File | null = null;
    let renderedTemplate = "";

    onMount(() => {
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        fileInput.addEventListener("change", async () => {
            const files = fileInput.files;
            if (!files || files.length === 0) return;
            imageFile = files[0];
            working = true;
            ({ renderedTemplate } = await processImageFile(imageFile));
            working = false;
        });
    });

    let working = false;
</script>

<input id="fileInput" type="file" accept=".dng,.DNG,.raw,.RAW,.nef,.NEF,.cr2,.CR2,.arw,.ARW,.tiff,.TIFF,.tif,.TIF" /><br />
{#if working}
    <p>Processing image...</p>
{/if}
<button on:click={() => downloadFLSpace({ renderedTemplate })}>Download .flspace File</button><br />
<canvas id="imageDebayered" on:click={logCanvasPixelPosition} /><br />
Debug:<br />
<canvas id="measuredDebug" /><br />
Measured:<br />
<canvas id="ccMeasured" /><br />
Reference:<br />
<canvas id="ccReference" /><br />
Result:<br />
<canvas id="ccResult" />

<style>
    canvas {
        border: 1px solid black;
        max-height: 100vh;
        max-width: 100%;
    }
</style>
