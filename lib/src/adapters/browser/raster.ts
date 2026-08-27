/**
 * SVG to PNG, in a browser.
 *
 * Rasterising is deliberately outside the core: the core produces an SVG string
 * and nothing else, because that is the one thing both runtimes can do with no
 * dependency. Turning pixels out of it needs a platform — a canvas here, a
 * native library in Node — so it lives in the adapters.
 *
 * Works in a window and in a worker: `OffscreenCanvas` is used when available,
 * a detached `<canvas>` otherwise.
 */

export interface RasterOptions {
	/**
	 * Pixels per SVG unit. 2 gives a retina-sharp image. Ignored if `width` or
	 * `height` is given.
	 */
	readonly scale?: number;
	/** Force an output width in pixels. Height follows the aspect ratio. */
	readonly width?: number;
	/** Force an output height in pixels. Width follows the aspect ratio. */
	readonly height?: number;
	/** Fill behind the image. Omit for transparency. */
	readonly background?: string;
	/** MIME type. Default `image/png`. */
	readonly type?: string;
	/** Quality for lossy types, 0-1. */
	readonly quality?: number;
}

interface Dimensions {
	readonly width: number;
	readonly height: number;
}

/** Read the intrinsic size out of an SVG document string. */
export function svgDimensions(svg: string): Dimensions {
	const width = /\bwidth="([\d.]+)"/.exec(svg);
	const height = /\bheight="([\d.]+)"/.exec(svg);
	if (width && height) {
		return { width: Number.parseFloat(width[1]), height: Number.parseFloat(height[1]) };
	}
	const viewBox = /\bviewBox="([\d.\s-]+)"/.exec(svg);
	if (viewBox) {
		const parts = viewBox[1].trim().split(/\s+/).map(Number);
		if (parts.length === 4) return { width: parts[2], height: parts[3] };
	}
	throw new Error("Could not determine the SVG size: no width/height and no viewBox");
}

function targetSize(source: Dimensions, options: RasterOptions): Dimensions {
	if (options.width && options.height) return { width: options.width, height: options.height };
	if (options.width) {
		return { width: options.width, height: Math.round((options.width / source.width) * source.height) };
	}
	if (options.height) {
		return { width: Math.round((options.height / source.height) * source.width), height: options.height };
	}
	const scale = options.scale ?? 2;
	return { width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
}

function makeCanvas(width: number, height: number): {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
	const offscreen = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
	if (offscreen) {
		const canvas = new offscreen(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not get a 2d context from OffscreenCanvas");
		return { canvas, context };
	}
	const doc = (globalThis as { document?: Document }).document;
	if (!doc) {
		throw new Error(
			"No canvas available. svgToPng needs a browser context; in Node, rasterise the SVG with a " +
				"library such as @resvg/resvg-js instead.",
		);
	}
	const canvas = doc.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Could not get a 2d context from the canvas");
	return { canvas, context };
}

/** Decode an SVG string into something drawable. */
async function decode(svg: string, size: Dimensions): Promise<CanvasImageSource> {
	const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });

	// createImageBitmap is the only route in a worker, and the faster route in a
	// window. Firefox has historically refused SVG blobs here, so fall back.
	const create = (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
	if (create) {
		try {
			return await create(blob);
		} catch {
			// Fall through to the Image path.
		}
	}

	const ImageCtor = (globalThis as { Image?: typeof Image }).Image;
	if (!ImageCtor) throw new Error("Neither createImageBitmap nor Image is available to decode the SVG");

	const url = URL.createObjectURL(blob);
	try {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new ImageCtor();
			image.width = size.width;
			image.height = size.height;
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error("The browser could not decode the SVG"));
			image.src = url;
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Rasterise an SVG string to a PNG blob. */
export async function svgToPngBlob(svg: string, options: RasterOptions = {}): Promise<Blob> {
	const source = svgDimensions(svg);
	const size = targetSize(source, options);
	const { canvas, context } = makeCanvas(size.width, size.height);

	if (options.background) {
		context.fillStyle = options.background;
		context.fillRect(0, 0, size.width, size.height);
	}

	const image = await decode(svg, source);
	context.drawImage(image as CanvasImageSource, 0, 0, size.width, size.height);
	if ("close" in image && typeof image.close === "function") image.close();

	const type = options.type ?? "image/png";
	if ("convertToBlob" in canvas) {
		return canvas.convertToBlob({ type, quality: options.quality });
	}
	return new Promise<Blob>((resolve, reject) => {
		(canvas as HTMLCanvasElement).toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Canvas produced no blob"))),
			type,
			options.quality,
		);
	});
}

/** Rasterise to a data URL, for dropping straight into an `<img src>`. */
export async function svgToPngDataUrl(svg: string, options: RasterOptions = {}): Promise<string> {
	const blob = await svgToPngBlob(svg, options);
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("Could not read the PNG blob"));
		reader.readAsDataURL(blob);
	});
}

/** Rasterise to raw bytes. */
export async function svgToPngBytes(svg: string, options: RasterOptions = {}): Promise<Uint8Array> {
	const blob = await svgToPngBlob(svg, options);
	return new Uint8Array(await blob.arrayBuffer());
}
