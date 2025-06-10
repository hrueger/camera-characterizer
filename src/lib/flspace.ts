import flspaceTemplate from "$lib/template.flspace.mustache?raw";
import type Matrix from "ml-matrix";
import Mustache from "mustache";

export function downloadFLSpace(options: { renderedTemplate: string }) {
    const blob = new Blob([options.renderedTemplate], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "camera-characterization.flspace";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function renderFLSpaceTemplate(matrix: Matrix) {
    return Mustache.render(flspaceTemplate, {
        title: "Sigma FP Kühlschrank",
        blackPoint: 0,
        whitePoint: 256,
        transferFunctionName: "Linear",
        matrix: matrix
            .to2DArray()
            .map((row) => row.map((val) => val).join(", "))
            .join(",\n"),
    });
}
