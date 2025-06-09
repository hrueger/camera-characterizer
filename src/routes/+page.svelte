<script lang="ts">
    import { drawToCanvas } from "$lib/canvas";
    import LibRaw from "libraw-wasm";
    import type { LibRawRawImageData, LibRawFullMetadata } from "libraw-wasm/dist/types.d.ts";
    import { onMount } from "svelte";
    import { Matrix, pseudoInverse } from "ml-matrix";
    const imageFile = "/test.DNG";
    import Mustache from "mustache";
    import flspaceTemplate from "$lib/template.flspace.mustache?raw";

    type BayerOrder = [number, number, number, number];
    const BayerOrders = {
        RGGB: [0, 1, 1, 2],
        BGGR: [2, 1, 1, 0],
        GBRG: [1, 0, 2, 1],
        GRBG: [1, 2, 0, 1],
    } as const satisfies Record<string, BayerOrder>;

    onMount(async () => {
        const rotate: 0 | 180 = 180;

        const arrayBuffer = await fetch(imageFile).then((res) => res.arrayBuffer());
        console.log("Fetched image file:", arrayBuffer);
        // Instantiate LibRaw
        const raw = new LibRaw();
        // Open (decode) the RAW file
        await raw.open(new Uint8Array(arrayBuffer), {
            useCameraWb: 1,
            bright: 4,
            userFlip: rotate == 180 ? 3 : 0,
        });

        // Fetch metadata
        const meta = await raw.metadata(true);
        console.log("Metadata:", meta.color_data);

        // Fetch the decoded image data (RGB pixels)
        const imageData = await raw.imageData();
        console.log("Image data:", imageData);

        const rawImageData = await raw.rawImageData();
        let bayerOrder = BayerOrders.RGGB as BayerOrder;
        if (rotate == 180) {
            const { data, order } = rotateRawData180(new Uint16Array(rawImageData.data.buffer), rawImageData.width, rawImageData.height, bayerOrder);
            rawImageData.data = data;
            bayerOrder = order;
        }
        const { width, height, rgb16 } = debayer(rawImageData, bayerOrder);

        const rgbNormalized = normalizeFloat32RGB(rgb16, 255, 4095);

        const overexposureInStops = 3;

        const rWB = 1.6211;
        const bWB = 2.0156;
        const rgbNormalizedWB = applyWhiteBalance(rgbNormalized, rWB, 1, bWB);
        const canvasRaw = document.getElementById("imageDebayered") as HTMLCanvasElement;
        canvasRaw.width = width;
        canvasRaw.height = height;
        drawToCanvas(canvasRaw, width, height, linearFloat32tosRGB(overexpose(rgbNormalizedWB, overexposureInStops)), 3);

        // Draw on canvas (raw pipeline)

        let topLeft = [1804, 973] as [number, number];
        let bottomRight = [2005, 1109] as [number, number];

        // draw rectangle on canvas
        const ctx = canvasRaw.getContext("2d");
        if (!ctx) {
            return console.error("Failed to get canvas context");
        }

        drawRectangle(ctx, topLeft, bottomRight);

        const imageDataForProcessing: Float32Array = rgbNormalizedWB;

        const SQUARES_X = 6;
        const SQUARES_Y = 4;
        const SQUARE_SIZE_PERCENTAGE = 0.5;

        const squareWidth = ((bottomRight[0] - topLeft[0]) / SQUARES_X) * SQUARE_SIZE_PERCENTAGE;
        const squareHeight = ((bottomRight[1] - topLeft[1]) / SQUARES_Y) * SQUARE_SIZE_PERCENTAGE;

        topLeft = [topLeft[0] - ((1 - SQUARE_SIZE_PERCENTAGE) * squareWidth) / 2, topLeft[1] - ((1 - SQUARE_SIZE_PERCENTAGE) * squareHeight) / 2];
        bottomRight = [bottomRight[0] + ((1 - SQUARE_SIZE_PERCENTAGE) * squareWidth) / 2, bottomRight[1] + ((1 - SQUARE_SIZE_PERCENTAGE) * squareHeight) / 2];

        // get square positions
        const squarePositions = [];
        for (let j = 0; j < SQUARES_Y; j++) {
            for (let i = 0; i < SQUARES_X; i++) {
                const x = topLeft[0] + (i * (bottomRight[0] - topLeft[0])) / SQUARES_X + ((1 - SQUARE_SIZE_PERCENTAGE) * ((bottomRight[0] - topLeft[0]) / SQUARES_X)) / 2;
                const y = topLeft[1] + (j * (bottomRight[1] - topLeft[1])) / SQUARES_Y + ((1 - SQUARE_SIZE_PERCENTAGE) * ((bottomRight[1] - topLeft[1]) / SQUARES_Y)) / 2;
                squarePositions.push([Math.round(x), Math.round(y)]);
            }
        }

        for (const pos of squarePositions) {
            ctx.strokeRect(pos[0], pos[1], squareWidth, squareHeight);
        }

        // get all pixel values in each square
        const pixelValues: { r: number; g: number; b: number }[][] = [];
        for (const square of squarePositions) {
            const squarePixels: { r: number; g: number; b: number }[] = [];
            const squareTopLeft = square;
            for (let y = 0; y < Math.round(squareHeight); y++) {
                for (let x = 0; x < Math.round(squareWidth); x++) {
                    const px = Math.round(squareTopLeft[0] + x);
                    const py = Math.round(squareTopLeft[1] + y);
                    if (px < 0 || py < 0 || px >= canvasRaw.width || py >= canvasRaw.height) continue;
                    const pixelIndex = (py * canvasRaw.width + px) * 3;
                    const r = imageDataForProcessing[pixelIndex];
                    const g = imageDataForProcessing[pixelIndex + 1];
                    const b = imageDataForProcessing[pixelIndex + 2];
                    squarePixels.push({ r, g, b });
                }
            }
            pixelValues.push(squarePixels);
        }

        console.log("Pixel values in squares:", pixelValues);

        // get mean (median) pixel values for each square individually
        function median(arr: number[]) {
            const sorted = arr.slice().sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        const meanValues = pixelValues.map((square) => {
            const rArr = square.map((p) => p.r);
            const gArr = square.map((p) => p.g);
            const bArr = square.map((p) => p.b);
            return {
                r: median(rArr),
                g: median(gArr),
                b: median(bArr),
            };
        });
        console.log("Median pixel values:", meanValues);

        // draw the squares in the color of the median pixel values
        for (let i = 0; i < squarePositions.length; i++) {
            const pos = squarePositions[i];
            const mean = meanValues[i];
            const values = [mean.r, mean.g, mean.b].map((v) => mapRange(linearFloat2sRGBFloatValue(overexposeValue(v, overexposureInStops)), 0, 1, 0, 255));
            ctx.fillStyle = `rgb(${values.join(", ")})`;
            ctx.fillRect(pos[0], pos[1], squareWidth, squareHeight);
        }

        // debug: draw the original square pixel values to measuredDebug
        const canvasDebug = document.getElementById("measuredDebug") as HTMLCanvasElement;
        canvasDebug.width = squareWidth * SQUARES_X;
        canvasDebug.height = squareHeight * SQUARES_Y;
        const ctxDebug = canvasDebug.getContext("2d");
        if (!ctxDebug) {
            return console.error("Failed to get canvas context for debug canvas");
        }
        ctxDebug.clearRect(0, 0, canvasDebug.width, canvasDebug.height);
        for (let i = 0; i < SQUARES_X; i++) {
            for (let j = 0; j < SQUARES_Y; j++) {
                const mean = meanValues[i * SQUARES_Y + j];
                const values = [mean.r, mean.g, mean.b].map((v) => Math.round(linearFloat2sRGBFloatValue(overexposeValue(v, overexposureInStops)) * 255));
                ctxDebug.fillStyle = `rgb(${values.join(", ")})`;
                ctxDebug.fillRect(i * squareWidth, j * squareHeight, squareWidth, squareHeight);
            }
        }

        // const reference rgb
        const referenceRGB = [
            [115, 82, 68],
            [195, 149, 128],
            [93, 123, 157],
            [91, 108, 65],
            [130, 129, 175],
            [99, 191, 171],
            [220, 123, 46],
            [72, 92, 168],
            [194, 84, 97],
            [91, 59, 104],
            [161, 189, 62],
            [229, 161, 40],
            [42, 63, 147],
            [72, 149, 72],
            [175, 50, 57],
            [238, 200, 22],
            [188, 84, 150],
            [0, 137, 166],
            [245, 245, 240],
            [201, 202, 201],
            [161, 162, 162],
            [120, 121, 121],
            [83, 85, 85],
            [50, 50, 51],
        ];

        // sRGB to linear conversion function
        function sRGB2linear(x: number): number {
            return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        }

        const meanValuesTestMatlab = [
            [0.0089, 0.0081, 0.0073],
            [0.027, 0.0258, 0.0262],
            [0.0101, 0.0193, 0.0299],
            [0.0072, 0.0115, 0.0089],
            [0.0135, 0.0214, 0.0346],
            [0.0169, 0.0396, 0.0451],
            [0.03, 0.0182, 0.0105],
            [0.0068, 0.0143, 0.032],
            [0.0211, 0.0107, 0.0115],
            [0.0059, 0.0065, 0.0115],
            [0.0211, 0.0346, 0.0189],
            [0.0308, 0.0255, 0.0121],
            [0.0042, 0.0086, 0.0215],
            [0.0093, 0.0219, 0.0152],
            [0.0173, 0.0065, 0.0063],
            [0.0376, 0.0401, 0.0173],
            [0.0215, 0.0141, 0.0231],
            [0.008, 0.0234, 0.0373],
            [0.0528, 0.076, 0.0877],
            [0.0329, 0.0477, 0.0556],
            [0.0215, 0.0307, 0.0367],
            [0.0127, 0.0182, 0.0215],
            [0.0072, 0.0104, 0.0121],
            [0.0038, 0.0052, 0.0063],
        ];

        const ccMeasured = new Matrix(meanValues.map((v) => [v.r, v.g, v.b]));
        // const ccMeasured = new Matrix(meanValuesTestMatlab);

        // Linearize reference RGB values (divide by 255 before linearization!)
        const referenceRGB_linear = referenceRGB.map(([r, g, b]) => [sRGB2linear(r / 255), sRGB2linear(g / 255), sRGB2linear(b / 255)]);
        const ccRef = new Matrix(referenceRGB_linear);
        console.log(ccRef);
        console.log("Measured RGB matrix (scaled):", ccMeasured.toString());

        // Use pseudoInverse(ccMeasured).mmul(ccRef) to match MATLAB
        const M = pseudoInverse(ccMeasured).mmul(ccRef);
        console.log("Color correction matrix M:", M.toString());

        // sRGB to XYZ matrix
        const sRGB2XYZ = [
            [0.412390799265959, 0.21263900587151, 0.019330818715592],
            [0.357584339383878, 0.715168678767756, 0.119194779794626],
            [0.180480788401834, 0.072192315360734, 0.950532152249661],
        ];
        const sRGB2XYZ_Matrix = new Matrix(sRGB2XYZ);

        // Calculate M_Sigma_to_XYZ
        const M_Sigma_to_XYZ = M.mmul(sRGB2XYZ_Matrix);
        console.log("M_Sigma_to_XYZ:", M_Sigma_to_XYZ.toString());

        // Normalize columns
        const colSums = M_Sigma_to_XYZ.sum("column");
        const M_Normalized = M_Sigma_to_XYZ.clone();
        for (let col = 0; col < 3; col++) {
            for (let row = 0; row < 3; row++) {
                M_Normalized.set(row, col, M_Sigma_to_XYZ.get(row, col) / colSums[col]);
            }
        }
        console.log("M_Normalized:", M_Normalized.toString());

        // Filmlight matrix is the transpose
        const M_Filmlight = M_Normalized.transpose();
        console.log("M_Filmlight:", M_Filmlight.toString());

        const template = Mustache.render(flspaceTemplate, {
            title: "Sigma FP Kühlschrank",
            blackPoint: 0,
            whitePoint: 256,
            transferFunctionName: "Linear",
            matrix: M_Filmlight.to2DArray()
                .map((row) => row.map((val) => val).join(", "))
                .join(",\n"),
        });

        console.log("Template rendered:", template);

        if (location.search.includes("download")) {
            const blob = new Blob([template], { type: "text/plain" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "camera-characterization.flspace";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        console.log(
            "Reference Test-Matrix\n",
            [
                [0.7784, 0.1931, 0.0285],
                [0.3035, 0.8845, -0.1879],
                [0.1082, -0.5238, 1.4156],
            ]
                .map((row) => row.map((val) => val.toFixed(6)).join(", "))
                .join("\n")
        );

        drawCCCanvas("ccMeasured", ccMeasured);
        drawCCCanvas("ccReference", ccRef);
        drawCCCanvas("ccResult", ccMeasured.mmul(M));
    });

    function drawRectangle(ctx: CanvasRenderingContext2D, topLeft: [number, number], bottomRight: [number, number]) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
    }

    function logCanvasPixelPosition(event: MouseEvent) {
        // log which canvas pixel was clicked, can be scaled
        const canvas = event.currentTarget as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
        const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));
        console.log(`Canvas pixel position: (${x}, ${y})`);
    }

    function debayer(rawImageData: LibRawRawImageData, bayerOrder: BayerOrder): { width: number; height: number; rgb16: Float32Array } {
        console.log("Raw image data:", rawImageData);
        const width = rawImageData.width;
        const height = rawImageData.height;
        const bayer = new Uint16Array(rawImageData.data.buffer);
        // Output RGB image
        const rgb16 = new Float32Array(width * height * 3);

        // First, assign only the known Bayer channel at each pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                let val = bayer[idx];
                // Determine Bayer channel using bayerOrder
                let c = 0;
                if (y % 2 === 0 && x % 2 === 0)
                    c = bayerOrder[0]; // Top-left
                else if (y % 2 === 0 && x % 2 === 1)
                    c = bayerOrder[1]; // Top-right
                else if (y % 2 === 1 && x % 2 === 0)
                    c = bayerOrder[2]; // Bottom-left
                else if (y % 2 === 1 && x % 2 === 1) c = bayerOrder[3]; // Bottom-right
                rgb16[idx * 3 + c] = val;
            }
        }
        // Now, fill missing channels for each pixel by copying from the nearest pixel of the correct Bayer type
        // For each channel (0=R, 1=G, 2=B):
        for (let channel = 0; channel < 3; channel++) {
            // Find all Bayer positions for this channel
            const bayerPositions = [];
            for (let i = 0; i < 4; i++) {
                if (bayerOrder[i] === channel) bayerPositions.push(i);
            }
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    if (rgb16[idx * 3 + channel] === 0) {
                        // Find nearest pixel with this channel in the Bayer pattern
                        let found = false;
                        for (const pos of bayerPositions) {
                            // pos: 0=TL, 1=TR, 2=BL, 3=BR
                            let nx = x;
                            let ny = y;
                            if (pos === 0) {
                                nx = x - (x % 2);
                                ny = y - (y % 2);
                            } else if (pos === 1) {
                                nx = x - (x % 2) + 1;
                                ny = y - (y % 2);
                            } else if (pos === 2) {
                                nx = x - (x % 2);
                                ny = y - (y % 2) + 1;
                            } else if (pos === 3) {
                                nx = x - (x % 2) + 1;
                                ny = y - (y % 2) + 1;
                            }
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nidx = ny * width + nx;
                                if (rgb16[nidx * 3 + channel] !== 0) {
                                    rgb16[idx * 3 + channel] = rgb16[nidx * 3 + channel];
                                    found = true;
                                    break;
                                }
                            }
                        }
                        // If not found, leave as 0
                    }
                }
            }
        }
        return { width, height, rgb16 };
    }

    function normalizeFloat32RGB(rgb: Float32Array, blackLevel: number, whiteLevel: number): Float32Array {
        const normalized = new Float32Array(rgb.length);
        for (let i = 0; i < rgb.length; i++) {
            // Normalize to [0, 1] range
            normalized[i] = mapRange(rgb[i], blackLevel, whiteLevel, 0, 1);
            // Clamp to [0, 1]
            normalized[i] = Math.max(0, Math.min(1, normalized[i]));
        }
        return normalized;
    }

    function float32ArrayToUint8Array(floatArray: Float32Array): Uint8Array {
        const uint8Array = new Uint8Array(floatArray.length);
        for (let i = 0; i < floatArray.length; i++) {
            uint8Array[i] = Math.round(floatArray[i] * 255);
        }
        return uint8Array;
    }

    function linearFloat2sRGBFloatValue(x: number): number {
        return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    }

    function linearFloat32tosRGB(floatArray: Float32Array): Uint8Array {
        const uint8Array = new Uint8Array(floatArray.length);
        for (let i = 0; i < floatArray.length; i++) {
            uint8Array[i] = Math.round(linearFloat2sRGBFloatValue(floatArray[i]) * 255);
        }
        return uint8Array;
    }

    function overexpose(normalizedImage: Float32Array, stops: number): Float32Array {
        // Overexpose the image by a given number of stops
        const overexposed = new Float32Array(normalizedImage.length);
        for (let i = 0; i < normalizedImage.length; i++) {
            overexposed[i] = overexposeValue(normalizedImage[i], stops);
        }
        return overexposed;
    }

    function overexposeValue(value: number, stops: number): number {
        // Overexpose a single value by a given number of stops
        const factor = Math.pow(2, stops);
        return clamp(value * factor, 0, 1); // Clamp to [0, 1]
    }

    function applyWhiteBalance(rgb: Float32Array, rWB: number, gWB: number, bWB: number): Float32Array {
        // Apply white balance coefficients to RGB channels
        const wbApplied = new Float32Array(rgb.length);
        for (let i = 0; i < rgb.length; i += 3) {
            wbApplied[i] = clamp(rgb[i] * rWB, 0, 1); // R channel
            wbApplied[i + 1] = clamp(rgb[i + 1] * gWB, 0, 1); // G channel
            wbApplied[i + 2] = clamp(rgb[i + 2] * bWB, 0, 1); // B channel
        }
        return wbApplied;
    }

    function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    function rotateRawData180(rawData: Uint16Array, width: number, height: number, bayerOrder: BayerOrder): { data: Uint16Array; order: BayerOrder } {
        const rotated = new Uint16Array(rawData.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIndex = y * width + x;
                const dstIndex = (height - 1 - y) * width + (width - 1 - x);
                rotated[dstIndex] = rawData[srcIndex];
            }
        }

        // Adjust Bayer order for 180-degree rotation
        if (bayerOrder === BayerOrders.RGGB) {
            bayerOrder = BayerOrders.BGGR;
        } else if (bayerOrder === BayerOrders.BGGR) {
            bayerOrder = BayerOrders.RGGB;
        } else if (bayerOrder === BayerOrders.GBRG) {
            bayerOrder = BayerOrders.GRBG;
        } else if (bayerOrder === BayerOrders.GRBG) {
            bayerOrder = BayerOrders.GBRG;
        }

        return { data: rotated, order: bayerOrder };
    }

    function drawCCCanvas(canvasId: string, matrix: Matrix) {
        const squareWidth = 100;
        const squareHeight = 100;
        const squaresX = 6;
        const squaresY = 4;
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error(`Failed to get context for canvas ${canvasId}`);
            return;
        }
        canvas.width = squareWidth * squaresX;
        canvas.height = squareHeight * squaresY;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < squaresY; y++) {
            for (let x = 0; x < squaresX; x++) {
                const rgb = matrix.to2DArray()[y * squaresX + x].map((v) => 255 * linearFloat2sRGBFloatValue(v));
                ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 255)`;
                ctx.fillRect(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
            }
        }
    }
</script>

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
