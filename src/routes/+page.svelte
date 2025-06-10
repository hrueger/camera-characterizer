<script lang="ts">
    import { onMount } from "svelte";
    import { Matrix } from "ml-matrix";
    import { processImageFile } from "$lib";
    import { drawCCCanvas, logCanvasPixelPosition, type CCDrawingMode } from "$lib/canvas";
    import { downloadFLSpace } from "$lib/flspace";

    let imageFile: File | null = null;

    let result: Awaited<ReturnType<typeof processImageFile>> | undefined;

    onMount(() => {
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        fileInput.addEventListener("change", async () => {
            const files = fileInput.files;
            if (!files || files.length === 0) return;
            imageFile = files[0];
            working = true;
            result = await processImageFile(imageFile);
            drawCCs();
            working = false;
        });
    });

    function drawCCs() {
        if (!result) return;
        drawCCCanvas("ccMeasured", result.ccMeasured, ccDrawingMode);
        drawCCCanvas("ccReference", result.ccRef, ccDrawingMode);
        drawCCCanvas("ccResult", result.ccCalculated, ccDrawingMode);
    }

    let working = false;

    let ccDrawingMode: CCDrawingMode = "6x4";

    function required<T>(t: T | undefined) {
        return t as T;
    }
</script>

<input id="fileInput" class="form-control" type="file" accept=".dng,.DNG,.raw,.RAW,.nef,.NEF,.cr2,.CR2,.arw,.ARW,.tiff,.TIFF,.tif,.TIF" /><br />
{#if working}
    <p>Processing image...</p>
{/if}
{#if result}
    <button class="btn btn-outline-primary btn-sm" on:click={() => downloadFLSpace({ renderedTemplate: required(result).renderedTemplate })}>Download .flspace File</button><br />
{/if}
<canvas id="imageDebayered" on:click={logCanvasPixelPosition} /><br />

<div class="form-check">
    <input class="form-check-input" type="radio" id="ccDrawingMode6x4" name="ccDrawingMode6x4" bind:group={ccDrawingMode} value="6x4" on:change={drawCCs} />
    <label class="form-check-label" for="ccDrawingMode6x4"> 6x4 </label>
</div>
<div class="form-check">
    <input class="form-check-input" type="radio" id="ccDrawingMode24x1" name="ccDrawingMode24x1" bind:group={ccDrawingMode} value="24x1" on:change={drawCCs} />
    <label class="form-check-label" for="ccDrawingMode24x1"> 24x1 </label>
</div>

Debug:<br />
<canvas id="measuredDebug" />
<div class="d-flex flex-column">
    <canvas id="ccMeasured" />
    <canvas id="ccReference" />
    <canvas id="ccResult" />
</div>

<style>
    canvas {
        max-height: 100vh;
        max-width: 100%;
    }
</style>
