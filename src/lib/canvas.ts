import type Matrix from "ml-matrix";
import { linearFloat2sRGBFloatValue } from "./colorspaces";

// Helper function to draw to canvas from interleaved data and channel count
export function drawToCanvas(canvas: HTMLCanvasElement, width: number, height: number, data: Uint8Array, channels: 1 | 3 | 4) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += 4) {
        if (channels === 1) {
            const v = data[i];
            rgba[j] = v;
            rgba[j + 1] = v;
            rgba[j + 2] = v;
            rgba[j + 3] = 255;
        } else if (channels === 3) {
            rgba[j] = data[i * 3];
            rgba[j + 1] = data[i * 3 + 1];
            rgba[j + 2] = data[i * 3 + 2];
            rgba[j + 3] = 255;
        } else if (channels === 4) {
            rgba[j] = data[i * 4];
            rgba[j + 1] = data[i * 4 + 1];
            rgba[j + 2] = data[i * 4 + 2];
            rgba[j + 3] = data[i * 4 + 3];
        }
    }
    const imageDataObj = new ImageData(rgba, width, height);
    ctx.putImageData(imageDataObj, 0, 0);
}

export function drawRectangle(ctx: CanvasRenderingContext2D, topLeft: [number, number], bottomRight: [number, number]) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft[0], topLeft[1], bottomRight[0] - topLeft[0], bottomRight[1] - topLeft[1]);
}

export function logCanvasPixelPosition(event: MouseEvent) {
    // log which canvas pixel was clicked, can be scaled
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));
    console.log(`Canvas pixel position: (${x}, ${y})`);
}

export function drawCCCanvas(canvasId: string, matrix: Matrix) {
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
