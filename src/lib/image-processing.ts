import { BayerOrders, type BayerOrder } from "./debayering";
import { clamp } from "./math";

export function overexpose(normalizedImage: Float32Array, stops: number): Float32Array {
    // Overexpose the image by a given number of stops
    const overexposed = new Float32Array(normalizedImage.length);
    for (let i = 0; i < normalizedImage.length; i++) {
        overexposed[i] = overexposeValue(normalizedImage[i], stops);
    }
    return overexposed;
}

export function overexposeValue(value: number, stops: number): number {
    // Overexpose a single value by a given number of stops
    const factor = Math.pow(2, stops);
    return clamp(value * factor, 0, 1); // Clamp to [0, 1]
}

export function applyWhiteBalance(rgb: Float32Array, rWB: number, gWB: number, bWB: number): Float32Array {
    // Apply white balance coefficients to RGB channels
    const wbApplied = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i += 3) {
        wbApplied[i] = clamp(rgb[i] * rWB, 0, 1); // R channel
        wbApplied[i + 1] = clamp(rgb[i + 1] * gWB, 0, 1); // G channel
        wbApplied[i + 2] = clamp(rgb[i + 2] * bWB, 0, 1); // B channel
    }
    return wbApplied;
}

export function rotateRawData180(rawData: Uint16Array, width: number, height: number, bayerOrder: BayerOrder): { data: Uint16Array; order: BayerOrder } {
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
