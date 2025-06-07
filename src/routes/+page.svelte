<script lang="ts">
    import { drawToCanvas } from "$lib/canvas";
    import LibRaw from "libraw-wasm";
    import type { LibRawRawImageData, LibRawFullMetadata } from "libraw-wasm/dist/types.d.ts";
    import { onMount } from "svelte";
    import { Matrix, pseudoInverse } from "ml-matrix";
    const imageFile = "/test.DNG";
    import Mustache from "mustache";
    import flspaceTemplate from "$lib/template.flspace.mustache?raw";

    onMount(async () => {
        const rotate: 0 | 180 = 180;

        const arrayBuffer = await fetch(imageFile).then((res) => res.arrayBuffer());
        console.log("Fetched image file:", arrayBuffer);
        const output = document.getElementById("output")!;
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
        output.innerText = JSON.stringify(meta, null, 4);

        // Fetch the decoded image data (RGB pixels)
        const imageData = await raw.imageData();
        console.log("Image data:", imageData);

        const rawImageData = await raw.rawImageData();
        if (rotate == 180) {
            rawImageData.data = new Uint16Array(rawImageData.data.buffer).reverse();
        }
        const { width, height, rgb8 } = await debayer(rawImageData, meta, output);
        // Draw on canvas (raw pipeline)
        const canvasRaw = document.getElementById("imageDebayered") as HTMLCanvasElement;
        canvasRaw.width = width;
        canvasRaw.height = height;
        drawToCanvas(canvasRaw, width, height, rgb8, 3);

        let topLeft = [1802, 1009] as [number, number];
        let bottomRight = [2005, 1145] as [number, number];

        // draw rectangle on canvas
        const ctx = canvasRaw.getContext("2d");
        if (!ctx) {
            return console.error("Failed to get canvas context");
        }

        drawRectangle(ctx, topLeft, bottomRight);

        const SQUARES_X = 6;
        const SQUARES_Y = 4;
        const SQUARE_SIZE_PERCENTAGE = 0.7;

        const squareWidth = ((bottomRight[0] - topLeft[0]) / SQUARES_X) * SQUARE_SIZE_PERCENTAGE;
        const squareHeight = ((bottomRight[1] - topLeft[1]) / SQUARES_Y) * SQUARE_SIZE_PERCENTAGE;

        topLeft = [topLeft[0] - ((1 - SQUARE_SIZE_PERCENTAGE) * squareWidth) / 2, topLeft[1] - ((1 - SQUARE_SIZE_PERCENTAGE) * squareHeight) / 2];
        bottomRight = [bottomRight[0] + ((1 - SQUARE_SIZE_PERCENTAGE) * squareWidth) / 2, bottomRight[1] + ((1 - SQUARE_SIZE_PERCENTAGE) * squareHeight) / 2];

        // get square positions
        const squarePositions = [];
        for (let i = 0; i < SQUARES_X; i++) {
            for (let j = 0; j < SQUARES_Y; j++) {
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
                    const r = imageData.data[pixelIndex];
                    const g = imageData.data[pixelIndex + 1];
                    const b = imageData.data[pixelIndex + 2];
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
        output.innerText += `\nMedian pixel values: ${JSON.stringify(meanValues)}`;

        // draw the squares in the color of the median pixel values
        for (let i = 0; i < squarePositions.length; i++) {
            const pos = squarePositions[i];
            const mean = meanValues[i];
            ctx.fillStyle = `rgb(${mean.r}, ${mean.g}, ${mean.b})`;
            ctx.fillRect(pos[0], pos[1], squareWidth, squareHeight);
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

        // Linearize reference RGB values (divide by 255 before linearization!)
        const referenceRGB_linear = referenceRGB.map(([r, g, b]) => [sRGB2linear(r / 255), sRGB2linear(g / 255), sRGB2linear(b / 255)]);

        // Scale measured patch values to [0, 1] before matrix calculation (critical for matching MATLAB)
        const ccMeasured = new Matrix(meanValues.map((v) => [v.r / 255, v.g / 255, v.b / 255]));
        const ccRef = new Matrix(referenceRGB_linear);
        console.log("Measured RGB matrix (scaled):", ccMeasured.toString());
        output.innerText += `\nMeasured RGB matrix (scaled): ${ccMeasured.toString()}`;

        // Use pseudoInverse(ccMeasured).mmul(ccRef) to match MATLAB
        const M = pseudoInverse(ccMeasured).mmul(ccRef);
        console.log("Color correction matrix M:", M.toString());
        output.innerText += `\nColor correction matrix M: ${M.toString()}`;

        // sRGB to XYZ matrix
        const sRGB2XYZ = [
            [0.412390799265959, 0.21263900587151, 0.019330818715592],
            [0.357584339383878, 0.715168678767756, 0.119194779794626],
            [0.180480788401834, 0.072192315360734, 0.950532152249661],
        ];
        const sRGB2XYZ_Matrix = new Matrix(sRGB2XYZ);

        // Calculate M_Sigma_to_XYZ
        const M_Sigma_to_XYZ = M.mmul(sRGB2XYZ_Matrix);
        output.innerText += `\nM_Sigma_to_XYZ: ${M_Sigma_to_XYZ.toString()}`;
        console.log("M_Sigma_to_XYZ:", M_Sigma_to_XYZ.toString());

        // Normalize columns
        const colSums = M_Sigma_to_XYZ.sum("column");
        const M_Normalized = M_Sigma_to_XYZ.clone();
        for (let col = 0; col < 3; col++) {
            for (let row = 0; row < 3; row++) {
                M_Normalized.set(row, col, M_Sigma_to_XYZ.get(row, col) / colSums[col]);
            }
        }
        output.innerText += `\nM_Normalized: ${M_Normalized.toString()}`;
        console.log("M_Normalized:", M_Normalized.toString());

        // Filmlight matrix is the transpose
        const M_Filmlight = M_Normalized.transpose();
        output.innerText += `\nM_Filmlight: ${M_Filmlight.toString()}`;
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

        console.log(
            "Reference Test-Matrix\n",
            [
                [0.72840857702481, 0.259481552530898, 0.012109870444291],
                [0.283578414058249, 0.911551670105799, -0.195130084164048],
                [-0.043128048758427, -0.443078007703037, 1.486206056461465],
            ]
                .map((row) => row.map((val) => val.toFixed(6)).join(", "))
                .join("\n")
        );
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

    function debayer(rawImageData: LibRawRawImageData, meta: LibRawFullMetadata, output: HTMLElement) {
        console.log("Raw image data:", rawImageData);

        // --- MATLAB-like RAW processing ---
        // 1. Extract black/white level robustly from metadata
        function getBlackWhiteLevels(meta: any) {
            // Helper to extract a number or min/max from array/object
            function getMin(val: any): number {
                if (Array.isArray(val)) return Math.min(...val.map(Number));
                if (typeof val === "object" && val !== null) return Math.min(...Object.values(val).map(Number));
                return Number(val);
            }
            function getMax(val: any): number {
                if (Array.isArray(val)) return Math.max(...val.map(Number));
                if (typeof val === "object" && val !== null) return Math.max(...Object.values(val).map(Number));
                return Number(val);
            }
            // Black level candidates
            let blackCandidates = [meta.color_data?.black, meta.color_data?.ChannelBlackLevel, meta.color_data?.BlackLevel, meta.color_data?.black_level, meta.color_data?.blacklevel, meta.color_data?.blackLevel, meta.color_data?.cblack, meta.color_data?.AverageBlackLevel, meta.color_data?.dng_black, meta.color_data?.dng_cblack, meta.color_data?.BlackLevelTop, meta.color_data?.BlackLevelBottom, meta.color_data?.BlackLevel, meta.color_data?.BlackLevel ? meta.color_data.BlackLevel[0] : undefined, meta.color_data?.makernotes?.canon?.ChannelBlackLevel, meta.color_data?.makernotes?.canon?.AverageBlackLevel, meta.color_data?.makernotes?.fuji?.BlackLevel, meta.color_data?.makernotes?.kodak?.BlackLevelTop, meta.color_data?.makernotes?.kodak?.BlackLevelBottom].filter((v) => v !== undefined);
            let black = blackCandidates.length ? getMin(blackCandidates[0]) : 0;
            // White level candidates
            let whiteCandidates = [meta.color_data?.data_maximum, meta.color_data?.maximum, meta.color_data?.NormalWhiteLevel, meta.color_data?.WhiteLevel, meta.color_data?.white_level, meta.color_data?.whitelevel, meta.color_data?.whiteLevel, meta.color_data?.linear_max, meta.color_data?.dng_whitelevel, meta.color_data?.SpecularWhiteLevel, meta.color_data?.clipWhite, meta.color_data?.val100percent, meta.color_data?.makernotes?.canon?.NormalWhiteLevel, meta.color_data?.makernotes?.canon?.SpecularWhiteLevel, meta.color_data?.makernotes?.kodak?.clipWhite, meta.color_data?.makernotes?.kodak?.val100percent].filter((v) => v !== undefined);
            let white = whiteCandidates.length ? getMax(whiteCandidates[0]) : 1;
            console.log("Black/White level candidates:", { black, white });
            // return { black, white };
            return { black: 255, white: 4096 }; // For testing, use fixed values
        }
        const { black, white } = getBlackWhiteLevels(meta);
        console.log("Black/White levels:", black, white);
        output.innerText += `\nBlack/White levels: ${black}, ${white}`;

        // 2. Get white balance multipliers
        let wb = [1, 1, 1, 1];
        if (meta.color_data && meta.color_data.cam_mul) {
            wb = meta.color_data.cam_mul;
        } else if (meta.color_data && meta.color_data.pre_mul) {
            wb = meta.color_data.pre_mul;
        }
        wb = wb.slice(0, 3);
        if (wb.length < 3) {
            while (wb.length < 3) wb.push(1);
        }
        if (wb[1] !== 0) wb = wb.map((v) => v / wb[1]);
        console.log("White balance multipliers:", wb);
        output.innerText += `\nWhite balance multipliers: ${JSON.stringify(wb)}`;

        // 3. Normalize and white-balance the raw Bayer data
        // Assume RGGB Bayer pattern (can be improved for other patterns)
        const width = rawImageData.width;
        const height = rawImageData.height;
        const bayer = new Uint16Array(rawImageData.data.buffer);
        // Output RGB image
        const rgb = new Float32Array(width * height * 3);
        // First, assign only the known Bayer channel at each pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                let val = bayer[idx];
                // Normalize
                val = (val - black) / (white - black);
                val = Math.max(0, Math.min(1, val));
                // Determine Bayer channel (RGGB)
                let c = 0; // 0=R, 1=G, 2=B
                if (y % 2 === 0 && x % 2 === 0)
                    c = 0; // R
                else if (y % 2 === 0 && x % 2 === 1)
                    c = 1; // G
                else if (y % 2 === 1 && x % 2 === 0)
                    c = 1; // G
                else if (y % 2 === 1 && x % 2 === 1) c = 2; // B
                // Apply white balance
                val = val * wb[c];
                // Store only the known channel
                rgb[idx * 3 + c] = val;
            }
        }
        // Now, fill missing channels for each pixel by copying from the nearest pixel of the correct Bayer type
        // Fill R channel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (rgb[idx * 3 + 0] === 0) {
                    // Find nearest R pixel (even, even)
                    const rx = x % 2 === 0 ? x : x - 1;
                    const ry = y % 2 === 0 ? y : y - 1;
                    const rIdx = ry * width + rx;
                    rgb[idx * 3 + 0] = rgb[rIdx * 3 + 0];
                }
            }
        }
        // Fill G channel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (rgb[idx * 3 + 1] === 0) {
                    // Find nearest G pixel (even, odd) or (odd, even)
                    let gx = x;
                    let gy = y;
                    if (y % 2 === 0) gx = x % 2 === 1 ? x : x + 1 < width ? x + 1 : x - 1;
                    else gx = x % 2 === 0 ? x : x - 1;
                    if (gx < 0) gx = 0;
                    if (gx >= width) gx = width - 1;
                    const gIdx = gy * width + gx;
                    rgb[idx * 3 + 1] = rgb[gIdx * 3 + 1];
                }
            }
        }
        // Fill B channel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (rgb[idx * 3 + 2] === 0) {
                    // Find nearest B pixel (odd, odd)
                    const bx = x % 2 === 1 ? x : x + 1 < width ? x + 1 : x - 1;
                    const by = y % 2 === 1 ? y : y + 1 < height ? y + 1 : y - 1;
                    const bIdx = by * width + bx;
                    rgb[idx * 3 + 2] = rgb[bIdx * 3 + 2];
                }
            }
        }

        const overexposureRangeInStops = 3;
        // 4. Apply brightness factor
        for (let i = 0; i < rgb.length; i++) {
            rgb[i] = Math.max(0, Math.min(1, rgb[i] * Math.pow(2, overexposureRangeInStops)));
        }

        // 5. Convert to 8-bit for display and patch extraction
        const rgb8 = new Uint8Array(width * height * 3);
        for (let i = 0; i < rgb8.length; i++) {
            rgb8[i] = Math.round(Math.max(0, Math.min(1, rgb[i])) * 255);
        }

        return { width, height, rgb8 };
    }
</script>

<div id="output"></div>
<canvas id="imageDebayered" on:click={logCanvasPixelPosition} />

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
