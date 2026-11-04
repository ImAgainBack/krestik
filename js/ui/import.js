export async function readImageFile(file) {
  if (!file || !file.type.startsWith("image/"))
    throw new Error("Выберите подходящее изображение.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const factor = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas
    .getContext("2d", { willReadFrequently: true })
    .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  const image = canvas
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, canvas.width, canvas.height);
  return {
    source: blob,
    image: { width: canvas.width, height: canvas.height, data: image.data },
  };
}
