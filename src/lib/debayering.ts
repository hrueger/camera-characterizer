import type { LibRawRawImageData } from "libraw-wasm/dist/types";

export type BayerOrder = [number, number, number, number];
export const BayerOrders = {
    RGGB: [0, 1, 1, 2],
    BGGR: [2, 1, 1, 0],
    GBRG: [1, 0, 2, 1],
    GRBG: [1, 2, 0, 1],
} as const satisfies Record<string, BayerOrder>;

export function debayer(rawImageData: LibRawRawImageData, bayerOrder: BayerOrder): { width: number; height: number; rgb16: Float32Array } {
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
            if (y % 2 === 0 && x % 2 === 0) c = bayerOrder[0]; // Top-left
            else if (y % 2 === 0 && x % 2 === 1) c = bayerOrder[1]; // Top-right
            else if (y % 2 === 1 && x % 2 === 0) c = bayerOrder[2]; // Bottom-left
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
