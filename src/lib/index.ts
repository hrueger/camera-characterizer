import LibRaw from "libraw-wasm";
import { BayerOrders, debayer, type BayerOrder } from "./debayering";
import Matrix, { pseudoInverse } from "ml-matrix";
import Mustache from "mustache";
import { drawCCCanvas, drawRectangle, drawToCanvas } from "./canvas";
import { linearFloat32tosRGB, linearFloat2sRGBFloatValue, sRGB2linear } from "./colorspaces";
import { applyWhiteBalance, overexpose, overexposeValue, rotateRawData180 } from "./image-processing";
import { normalizeFloat32RGB, mapRange, median } from "./math";
import { renderFLSpaceTemplate } from "./flspace";
import { REFERENCE_RGB_VALUES, SRGB_TO_XYZ_MATRIX } from "./constants";

export async function processImageFile(file: File) {
    const rotate: 0 | 180 = 180;

    const arrayBuffer = await file.arrayBuffer();
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
        throw new Error("Failed to get canvas context");
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
        throw new Error("Failed to get canvas context for debug canvas");
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

    const ccMeasured = new Matrix(meanValues.map((v) => [v.r, v.g, v.b]));

    const referenceRGB_linear = REFERENCE_RGB_VALUES.map(([r, g, b]) => [sRGB2linear(r / 255), sRGB2linear(g / 255), sRGB2linear(b / 255)]);
    const ccRef = new Matrix(referenceRGB_linear);
    console.log(ccRef);
    console.log("Measured RGB matrix (scaled):", ccMeasured.toString());

    // Use pseudoInverse(ccMeasured).mmul(ccRef) to match MATLAB
    const M = pseudoInverse(ccMeasured).mmul(ccRef);
    console.log("Color correction matrix M:", M.toString());

    // Calculate M_Sigma_to_XYZ
    const M_Sigma_to_XYZ = M.mmul(SRGB_TO_XYZ_MATRIX);
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

    const renderedTemplate = renderFLSpaceTemplate(M_Filmlight);

    console.log("Template rendered:", renderedTemplate);

    const ccCalculated = ccMeasured.mmul(M);
    return {
        renderedTemplate,
        ccMeasured,
        ccRef,
        ccCalculated,
    };
}
