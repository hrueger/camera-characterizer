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
