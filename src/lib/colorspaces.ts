export function linearFloat2sRGBFloatValue(x: number): number {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function sRGB2linear(x: number): number {
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function linearFloat32tosRGB(floatArray: Float32Array): Uint8Array {
    const uint8Array = new Uint8Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
        uint8Array[i] = Math.round(linearFloat2sRGBFloatValue(floatArray[i]) * 255);
    }
    return uint8Array;
}
