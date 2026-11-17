// pdf.js (inside pdf-parse) expects the browser classes DOMMatrix, ImageData and Path2D.
// On a server without the native canvas add-on they do not exist, and reading ANY PDF fails with
// "DOMMatrix is not defined". Text extraction never draws anything, so light stand-ins are enough.
// Real implementations are used when @napi-rs/canvas is installed.
let canvas = {};
try {
  canvas = require('@napi-rs/canvas');
} catch (_) { /* optional */ }

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = canvas.DOMMatrix || class DOMMatrix {
    constructor(init) {
      const m = Array.isArray(init) && init.length >= 6 ? init : [1, 0, 0, 1, 0, 0];
      [this.a, this.b, this.c, this.d, this.e, this.f] = m;
    }
    multiplySelf() { return this; }
    preMultiplySelf() { return this; }
    translate() { return this; }
    scale() { return this; }
    invertSelf() { return this; }
    transformPoint(p) { return p; }
  };
}
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = canvas.ImageData || class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = canvas.Path2D || class Path2D {};
}
