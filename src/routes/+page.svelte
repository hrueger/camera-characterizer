<script lang="ts">
    import { onMount } from "svelte";
    import { analyzeImageFile, calculateMatrix, getMeanValues, renderRawData, type ColorCheckerCoordinates } from "$lib";
    import { drawCCCanvas, getMousePosition, type CCDrawingMode } from "$lib/canvas";
    import { downloadFLSpace } from "$lib/flspace";

    let imageFile: File | null = null;
    let options: Awaited<ReturnType<typeof analyzeImageFile>> | undefined;
    let rawData: Awaited<ReturnType<typeof renderRawData>> | undefined;
    let resultMeanValues: Awaited<ReturnType<typeof getMeanValues>> | undefined;
    let resultMatrixes: Awaited<ReturnType<typeof calculateMatrix>> | undefined;
    let working = false;
    let ccDrawingMode: CCDrawingMode = "6x4";
    let colorChecker: Partial<ColorCheckerCoordinates> = {};
    let colorCheckerStatus: "unset" | "topLeftSet" | "allSet" = "unset";

    onMount(() => {
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        fileInput.addEventListener("change", async () => {
            const files = fileInput.files;
            if (!files || files.length === 0) return;
            imageFile = files[0];
            working = true;
            options = await analyzeImageFile(imageFile);
            await renderPreview();
            working = false;
        });
    });

    async function renderPreview() {
        if (!options) return;
        working = true;
        setTimeout(async () => {
            if (!options) return;
            rawData = await renderRawData(options);
            await showSquaresAndCalcMatrixes();
            working = false;
        }, 100);
    }

    function drawCCs() {
        if (!resultMatrixes) return;
        drawCCCanvas("ccMeasured", resultMatrixes.ccMeasured, ccDrawingMode);
        drawCCCanvas("ccReference", resultMatrixes.ccRef, ccDrawingMode);
        drawCCCanvas("ccResult", resultMatrixes.ccCalculated, ccDrawingMode);
    }

    async function showSquaresAndCalcMatrixes() {
        if (!options) return;
        const ctx = (document.querySelector("#imageDebayered") as HTMLCanvasElement).getContext("2d")!;
        if (!(colorChecker?.topLeft && colorChecker?.bottomRight)) {
            return;
        }
        const options2 = { colorChecker: colorChecker as ColorCheckerCoordinates, ctx, height: options.rawImageData.height, width: options.rawImageData.width, overexposureInStops: options.overexposureInStops, rgbNormalizedWB: rawData!.rgbNormalizedWB, canvasImageData: rawData!.canvasImageData };
        resultMeanValues = await getMeanValues(options2);
        resultMatrixes = await calculateMatrix(options2);
        drawCCs();
    }

    function required<T>(t: T | undefined) {
        return t as T;
    }

    function updateColorCheckerPosition(event: MouseEvent) {
        if (colorCheckerStatus == "allSet") return;
        if (colorCheckerStatus == "topLeftSet") {
            const mousePosition = getMousePosition(event);
            colorChecker.bottomRight = [Math.max(colorChecker.topLeft![0], mousePosition[0]), Math.max(colorChecker.topLeft![1], mousePosition[1])];
        } else if (colorCheckerStatus == "unset") {
            colorChecker.topLeft = getMousePosition(event);
        }
        showSquaresAndCalcMatrixes();
    }

    // Canvas captions
    const captions = ["Measured", "Reference", "Result"];
</script>

<div class="container-fluid py-2">
    <div class="row">
        <div class="col-12">
            <h1 class="mb-3">Chamera Characterization Tool</h1>
            <div class="card mb-3 p-3">
                <input id="fileInput" class="form-control mb-2" type="file" accept=".dng,.DNG,.raw,.RAW,.nef,.NEF,.cr2,.CR2,.arw,.ARW,.tiff,.TIFF,.tif,.TIF" />
                {#if working}
                    <div class="alert alert-info py-2">Processing image...</div>
                {/if}
            </div>

            {#if options}
                <div class="card mb-3 p-3">
                    <div class="mb-2">
                        <div class="mb-2 fw-bold">Settings</div>

                        <div class="row">
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <span class="col-sm-7">Colorchecker-Preview-Mode</span>
                                    <div class="col-sm-5">
                                        <div class="form-check form-check-inline me-3">
                                            <input class="form-check-input" type="radio" id="ccDrawingMode6x4" name="ccDrawingMode" bind:group={ccDrawingMode} value="6x4" on:change={drawCCs} />
                                            <label class="text-end form-check-label" for="ccDrawingMode6x4">6x4</label>
                                        </div>
                                        <div class="form-check form-check-inline">
                                            <input class="form-check-input" type="radio" id="ccDrawingMode24x1" name="ccDrawingMode" bind:group={ccDrawingMode} value="24x1" on:change={drawCCs} />
                                            <label class="text-end form-check-label" for="ccDrawingMode24x1">24x1</label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="blackLevel">Black Level</label>
                                    <div class="col-sm-5">
                                        <input type="number" class="form-control" id="blackLevel" bind:value={options.blackLevel} step="1" on:change={renderPreview} />
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="whiteLevel">White Level</label>
                                    <div class="col-sm-5">
                                        <input type="number" class="form-control" id="whiteLevel" bind:value={options.whiteLevel} step="1" on:change={renderPreview} />
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="rWB">White Balance: Red</label>
                                    <div class="col-sm-5">
                                        <input type="number" class="form-control" id="rWB" bind:value={options.rWB} step="0.0001" on:change={renderPreview} />
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="bWB">White Balance: Blue</label>
                                    <div class="col-sm-5">
                                        <input type="number" class="form-control" id="bWB" bind:value={options.bWB} step="0.0001" on:change={renderPreview} />
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="overexposureInStops">Overexposure in Stops</label>
                                    <div class="col-sm-5">
                                        <input type="number" class="form-control" id="overexposureInStops" bind:value={options.overexposureInStops} step="0.1" on:change={renderPreview} />
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-sm-6 col-md-3">
                                <div class="row mb-3">
                                    <label class="text-end col-sm-7" for="rotate">Rotate</label>
                                    <div class="col-sm-5">
                                        <select class="form-select" id="rotate" bind:value={options.rotate} on:change={renderPreview}>
                                            <option value={0}>0°</option>
                                            <option value={180}>180°</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
    <div class="row">
        <div class="col-md-6">
            <div class="card mb-3 p-3" class:opacity-0={!imageFile}>
                <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                <div class="mb-2">
                    <div class="mb-2 fw-bold">Select Colorpicker</div>
                    <canvas
                        id="imageDebayered"
                        class="w-100 border rounded"
                        on:mousemove={updateColorCheckerPosition}
                        on:click={(event) => {
                            if (colorCheckerStatus == "topLeftSet") {
                                colorCheckerStatus = "allSet";
                            } else if (colorCheckerStatus == "allSet") {
                                colorCheckerStatus = "unset";
                                colorChecker = {};
                                updateColorCheckerPosition(event);
                                colorCheckerStatus = "topLeftSet";
                            } else if (colorCheckerStatus == "unset") {
                                colorCheckerStatus = "topLeftSet";
                            }
                        }}
                        on:keydown
                    />
                </div>
                <div class="text-muted small">
                    {#if colorCheckerStatus == "unset"}
                        Click on the image to set the top left corner of the Color Checker.
                    {:else if colorCheckerStatus == "topLeftSet"}
                        Click on the image to set the bottom right corner of the Color Checker.<br />
                        Press ESC to go back to setting the first corner.
                    {/if}
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card mb-3 p-3" class:opacity-0={!imageFile}>
                <div class="mb-2 fw-bold">Debug</div>
                <canvas id="measuredDebug" class="border rounded mb-2" />
            </div>

            <div class="card mb-3 p-3" class:opacity-0={!resultMatrixes}>
                <div class="fw-bold mb-3">Color Chart Canvases</div>
                {#if ccDrawingMode === "6x4"}
                    <div class="d-flex flex-row justify-content-center align-items-end gap-3 mb-2">
                        <div class="d-flex flex-column align-items-center">
                            <canvas id="ccMeasured" class="border rounded bg-light" />
                            <div class="mt-2 text-center text-secondary">{captions[0]}</div>
                        </div>
                        <div class="d-flex flex-column align-items-center">
                            <canvas id="ccReference" class="border rounded bg-light" />
                            <div class="mt-2 text-center text-secondary">{captions[1]}</div>
                        </div>
                        <div class="d-flex flex-column align-items-center">
                            <canvas id="ccResult" class="border rounded bg-light" />
                            <div class="mt-2 text-center text-secondary">{captions[2]}</div>
                        </div>
                    </div>
                {:else if ccDrawingMode === "24x1"}
                    <div class="cc-24x1-grid overflow-x-auto">
                        <div class="cc-24x1-row">
                            <div class="cc-24x1-label">{captions[0]}</div>
                            <canvas id="ccMeasured" class="bg-light cc-24x1-canvas" />
                        </div>
                        <div class="cc-24x1-row">
                            <div class="cc-24x1-label">{captions[1]}</div>
                            <canvas id="ccReference" class="bg-light cc-24x1-canvas" />
                        </div>
                        <div class="cc-24x1-row">
                            <div class="cc-24x1-label">{captions[2]}</div>
                            <canvas id="ccResult" class="bg-light cc-24x1-canvas" />
                        </div>
                    </div>
                {/if}
            </div>

            {#if resultMatrixes}
                <div class="card mb-3 p-3">
                    <div class="mb-2 fw-bold">Baselight Colorspace Export</div>
                    <button class="btn btn-outline-primary btn-sm mb-2" on:click={() => downloadFLSpace({ renderedTemplate: required(resultMatrixes).renderedTemplate })}>Download .flspace File</button>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    canvas {
        max-height: 60vh;
        max-width: 100%;
        background: #f8f9fa;
    }
    .cc-24x1-grid {
        display: grid;
        grid-auto-rows: minmax(0, 1fr);
        row-gap: 0;
        width: 100%;
    }
    .cc-24x1-row {
        display: grid;
        grid-template-columns: 110px 1fr;
        align-items: center;
        width: 100%;
    }
    .cc-24x1-label {
        position: sticky;
        left: 0;
        background: #fff;
        z-index: 2;
        min-width: 110px;
        max-width: 110px;
        color: #6c757d;
        padding-right: 8px;
        font-size: 1rem;
        white-space: nowrap;
        border-right: 1px solid #eee;
        height: 6rem;
        vertical-align: middle;
    }
    .cc-24x1-canvas {
        border: none !important;
        border-radius: 0 !important;
        margin-right: 0 !important;
        max-width: none;
        box-sizing: border-box;
        display: block;
        height: 6rem;
        width: auto;
    }
    .card {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .gap-3 > * + * {
        margin-left: 1.5rem !important;
    }
    #measuredDebug {
        height: 8rem;
        width: 12rem;
    }
</style>
