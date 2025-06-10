import LibRaw from "libraw-wasm";
import Matrix, { pseudoInverse } from "ml-matrix";
import { drawRectangle, drawToCanvas } from "./canvas";
import { linearFloat2sRGBFloatValue, linearFloat32tosRGB, sRGB2linear, sRGB2linearFloat32 } from "./colorspaces";
import { applyWhiteBalance, overexpose, overexposeValue, rotateRawData180 } from "./image-processing";
import { mapRange, median, normalizeFloat32RGB } from "./math";
import { renderFLSpaceTemplate } from "./flspace";
import { REFERENCE_RGB_VALUES, SRGB_TO_XYZ_MATRIX } from "./constants";
import type { LibRawImageData, LibRawRawImageData } from "libraw-wasm/dist/types";
import { BayerOrders, debayer, type BayerOrder } from "./debayering";

type Options = {
    rotate: 0 | 180;
    whiteLevel: number;
    blackLevel: number;
    rawImageData: LibRawImageData;
    rawRawImageData: LibRawRawImageData;
    rWB: number;
    bWB: number;
    overexposureInStops: number;
    manufacturer: string;
    camera: string;
    scene: string;
    debayeringAlgorithm?: "custom" | "libraw";

    rotatedData?: { imageData: Uint16Array<ArrayBufferLike>; bayerOrder: BayerOrder };
};

export async function analyzeImageFile(file: File, options: Options | undefined): Promise<Options> {
    const arrayBuffer = await file.arrayBuffer();
    // Instantiate LibRaw
    const raw = new LibRaw();
    // Open (decode) the RAW file
    await raw.open(new Uint8Array(arrayBuffer), {
        useCameraWb: 1,
        bright: 4,
        userFlip: options?.rotate == 180 ? 3 : 0,
    });
    console.log(options?.rotate);

    // Fetch metadata
    const meta = await raw.metadata(true);

    const rawImageData = await raw.imageData();
    const rawRawImageData = await raw.rawImageData();

    return {
        ...options,
        rWB: meta.color_data.cam_mul[0],
        bWB: meta.color_data.cam_mul[2],
        blackLevel: 255,
        whiteLevel: 4095,
        overexposureInStops: options?.overexposureInStops ?? 3,
        manufacturer: meta.camera_make,
        camera: meta.camera_model,
        scene: "Unknown Scene",
        rawImageData,
        rawRawImageData,
        rotate: options?.rotate ?? 0,
        debayeringAlgorithm: options?.debayeringAlgorithm ?? "libraw",
    };
}

export async function renderRawData(options: Options) {
    if (options.debayeringAlgorithm === "libraw") {
        const canvasRaw = document.getElementById("imageDebayered") as HTMLCanvasElement;
        canvasRaw.width = options.rawImageData.width;
        canvasRaw.height = options.rawImageData.height;
        const rgbNormalizedWB = overexpose(sRGB2linearFloat32(options.rawImageData.data as Uint8Array), -options.overexposureInStops);
        const { imageData } = drawToCanvas(canvasRaw, canvasRaw.width, canvasRaw.height, options.rawImageData.data as Uint8Array, 3);
        return { rgbNormalizedWB, canvasImageData: imageData };
    }
    let bayerOrder = BayerOrders.RGGB as BayerOrder;
    let data = options.rawRawImageData.data;
    if (options.rotate == 180) {
        if (!options.rotatedData) {
            const { data, order } = rotateRawData180(new Uint16Array(options.rawRawImageData.data.buffer), options.rawRawImageData.width, options.rawRawImageData.height, bayerOrder);

            options.rotatedData = { imageData: data, bayerOrder: order };
        }
        bayerOrder = options.rotatedData.bayerOrder;
        data = options.rotatedData.imageData;
    }

    const { width, height, rgb16 } = debayer({ ...options.rawRawImageData, data }, bayerOrder);

    const rgbNormalized = normalizeFloat32RGB(rgb16, options.blackLevel, options.whiteLevel);

    const rgbNormalizedWB = applyWhiteBalance(rgbNormalized, options.rWB, 1, options.bWB);
    const canvasRaw = document.getElementById("imageDebayered") as HTMLCanvasElement;
    canvasRaw.width = width;
    canvasRaw.height = height;
    const { imageData } = drawToCanvas(canvasRaw, width, height, linearFloat32tosRGB(overexpose(rgbNormalizedWB, options.overexposureInStops)), 3);
    return { rgbNormalizedWB, canvasImageData: imageData };
}

export type ColorCheckerCoordinates = {
    topLeft: [number, number];
    bottomRight: [number, number];
};

export async function calculateMatrix(options: { rgbNormalizedWB: Float32Array<ArrayBufferLike>; colorChecker: ColorCheckerCoordinates; width: number; height: number; overexposureInStops: number; ctx: CanvasRenderingContext2D; canvasImageData: ImageData; options: Options }) {
    const meanValues = getMeanValues(options);

    const ccMeasured = new Matrix(meanValues.map((v) => [v.r, v.g, v.b]));

    const referenceRGB_linear = REFERENCE_RGB_VALUES.map(([r, g, b]) => [sRGB2linear(r / 255), sRGB2linear(g / 255), sRGB2linear(b / 255)]);
    const ccRef = new Matrix(referenceRGB_linear);

    const M = pseudoInverse(ccMeasured).mmul(ccRef);

    const M_to_XYZ = M.mmul(SRGB_TO_XYZ_MATRIX);

    // Normalize columns
    const colSums = M_to_XYZ.sum("column");
    const M_Normalized = M_to_XYZ.clone();
    for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
            M_Normalized.set(row, col, M_to_XYZ.get(row, col) / colSums[col]);
        }
    }

    const M_Filmlight = M_Normalized.transpose();

    const renderedTemplate = renderFLSpaceTemplate(M_Filmlight, getTitle(options.options));

    const ccCalculated = ccMeasured.mmul(M);
    return {
        renderedTemplate,
        ccMeasured,
        ccRef,
        ccCalculated,
    };
}

export function getTitle(options: Options) {
    return `${options.manufacturer} ${options.camera}: ${options.scene}`;
}

export function toSafeFilename(text: string) {
    const knownUmlauts = {
        ä: "ae",
        ö: "oe",
        ü: "ue",
        ß: "ss",
        Ä: "Ae",
        Ö: "Oe",
        Ü: "Ue",
    };
    text = text.replace(new RegExp(Object.keys(knownUmlauts).join("|"), "g"), (match) => knownUmlauts[match as keyof typeof knownUmlauts] || match);
    return text.replace(/[^a-zA-Z0-9-_]/g, "_").replace(/_+/g, "_");
}

export function getMeanValues(options: { rgbNormalizedWB: Float32Array<ArrayBufferLike>; colorChecker: ColorCheckerCoordinates; width: number; height: number; overexposureInStops: number; ctx: CanvasRenderingContext2D; canvasImageData: ImageData }) {
    const { colorChecker, rgbNormalizedWB, height, width, ctx, canvasImageData } = options;
    let { bottomRight, topLeft } = colorChecker;
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

    ctx.putImageData(canvasImageData, 0, 0);
    drawRectangle(ctx, topLeft, bottomRight);

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
                if (px < 0 || py < 0 || px >= width || py >= height) continue;
                const pixelIndex = (py * width + px) * 3;
                const r = imageDataForProcessing[pixelIndex];
                const g = imageDataForProcessing[pixelIndex + 1];
                const b = imageDataForProcessing[pixelIndex + 2];
                squarePixels.push({ r, g, b });
            }
        }
        pixelValues.push(squarePixels);
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

    // draw the squares in the color of the median pixel values
    for (let i = 0; i < squarePositions.length; i++) {
        const pos = squarePositions[i];
        const mean = meanValues[i];
        const values = [mean.r, mean.g, mean.b].map((v) => mapRange(linearFloat2sRGBFloatValue(overexposeValue(v, options.overexposureInStops)), 0, 1, 0, 255));
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
    for (let x = 0; x < SQUARES_X; x++) {
        for (let y = 0; y < SQUARES_Y; y++) {
            const mean = meanValues[y * SQUARES_X + x];
            const values = [mean.r, mean.g, mean.b].map((v) => Math.round(linearFloat2sRGBFloatValue(overexposeValue(v, options.overexposureInStops)) * 255));
            ctxDebug.fillStyle = `rgb(${values.join(", ")})`;
            ctxDebug.fillRect(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
        }
    }
    return meanValues;
}
