<script lang="ts">
    import { drawToCanvas } from "$lib/canvas";
    import LibRaw from "libraw-wasm";
    import { onMount } from "svelte";
    import { Matrix, pseudoInverse } from "ml-matrix";
    const imageFile = "/test.DNG";
    import Mustache from "mustache";
    import flspaceTemplate from "$lib/template.flspace.mustache?raw";

    onMount(async () => {
        const arrayBuffer = await fetch(imageFile).then((res) => res.arrayBuffer());
        console.log("Fetched image file:", arrayBuffer);
        const output = document.getElementById("output")!;
        // Instantiate LibRaw
        const raw = new LibRaw();
        // Open (decode) the RAW file
        await raw.open(new Uint8Array(arrayBuffer), {
            useCameraWb: 1,
            bright: 4,
            userFlip: 3,
        });

        // Fetch metadata
        const meta = await raw.metadata(true);
        console.log("Metadata:", meta.color_data);
        output.innerText = JSON.stringify(meta, null, 4);

        // Fetch the decoded image data (RGB pixels)
        const imageData = await raw.imageData();
        console.log("Image data:", imageData);

        // draw on canvas (debayered)
        const canvas = document.getElementById("imageDebayered") as HTMLCanvasElement;
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        drawToCanvas(canvas, imageData.width, imageData.height, new Uint8Array(imageData.data), 3);
        console.log("Image drawn on canvas");

        let topLeft = [1802, 1009] as [number, number];
        let bottomRight = [2005, 1145] as [number, number];

        // draw rectangle on canvas
        const ctx = canvas.getContext("2d");
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
                    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
                    const pixelIndex = (py * canvas.width + px) * 3;
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
            [0.1714, 0.0844, 0.0578],
            [0.5457, 0.3005, 0.2159],
            [0.1095, 0.1981, 0.3372],
            [0.1046, 0.15, 0.0529],
            [0.2232, 0.2195, 0.4287],
            [0.1248, 0.521, 0.4072],
            [0.7157, 0.1981, 0.0273],
            [0.0648, 0.107, 0.3916],
            [0.5395, 0.0887, 0.1195],
            [0.1046, 0.0437, 0.1384],
            [0.3564, 0.5089, 0.0482],
            [0.7835, 0.3564, 0.0212],
            [0.0232, 0.0497, 0.2918],
            [0.0648, 0.3005, 0.0648],
            [0.4287, 0.0319, 0.0409],
            [0.855, 0.5776, 0.008],
            [0.5029, 0.0887, 0.305],
            [0, 0.2502, 0.3813],
            [0.9131, 0.9131, 0.8714],
            [0.5841, 0.5906, 0.5841],
            [0.3564, 0.3613, 0.3613],
            [0.1878, 0.1912, 0.1912],
            [0.0865, 0.0908, 0.0908],
            [0.0319, 0.0319, 0.0331],
        ];

        // Calculate Pseudoinverse
        const ccRef = new Matrix(referenceRGB);
        const ccRefInv = pseudoInverse(ccRef);
        console.log("Pseudoinverse of reference RGB matrix:", ccRefInv.toString());
        output.innerText += `\nPseudoinverse of reference RGB matrix: ${ccRefInv.toString()}`;
        const ccMeasured = new Matrix(meanValues.map((v) => [v.r, v.g, v.b]));
        console.log("Measured RGB matrix:", ccMeasured.toString());
        output.innerText += `\nMeasured RGB matrix: ${ccMeasured.toString()}`;

        const M = ccRefInv.mmul(ccMeasured);
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

        console.log("Reference Test-Matrix", [
            [0.72840857702481, 0.259481552530898, 0.012109870444291],
            [0.283578414058249, 0.911551670105799, -0.195130084164048],
            [-0.043128048758427, -0.443078007703037, 1.486206056461465],
        ]);
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
