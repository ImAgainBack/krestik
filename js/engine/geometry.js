// Unit square -> source quadrilateral, using a projective (not bilinear) map.
export function homography(q) {
  if (
    !Array.isArray(q) ||
    q.length !== 4 ||
    q.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v)),
    )
  )
    throw new RangeError("Invalid quad");
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4],
      c = q[(i + 2) % 4],
      cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-8 || (sign && cross * sign < 0))
      throw new RangeError("Quad must be convex and nondegenerate");
    sign = cross;
  }
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx = x0 - x1 + x2 - x3,
    dy = y0 - y1 + y2 - y3,
    ax = x1 - x2,
    bx = x3 - x2,
    ay = y1 - y2,
    by = y3 - y2;
  const det = ax * by - bx * ay;
  const g = (dx * by - bx * dy) / det,
    h = (ax * dy - dx * ay) / det;
  return new Float64Array([
    x1 - x0 + g * x1,
    x3 - x0 + h * x3,
    x0,
    y1 - y0 + g * y1,
    y3 - y0 + h * y3,
    y0,
    g,
    h,
    1,
  ]);
}
export function project(h, u, v, out = new Float64Array(2)) {
  const w = h[6] * u + h[7] * v + 1;
  out[0] = (h[0] * u + h[1] * v + h[2]) / w;
  out[1] = (h[3] * u + h[4] * v + h[5]) / w;
  return out;
}
export function imageMap(img, quad) {
  return homography(
    quad ?? [
      [0, 0],
      [img.width, 0],
      [img.width, img.height],
      [0, img.height],
    ],
  );
}
export function validateImage(img) {
  if (
    !img ||
    !Number.isInteger(img.width) ||
    !Number.isInteger(img.height) ||
    img.width < 1 ||
    img.height < 1 ||
    !img.data ||
    img.data.length !== img.width * img.height * 4
  )
    throw new RangeError("Invalid RGBA image");
}
