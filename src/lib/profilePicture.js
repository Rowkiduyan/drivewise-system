export const PROFILE_PICTURE_SIZE = 256

// Checked against the raw picked file, before any decoding/cropping —
// gives a fast, clear error instead of letting the browser churn through
// createImageBitmap on a pathologically large file. The Edge Function
// enforces its own (much smaller) cap on the processed output; this is
// just about failing fast on obviously-too-big input.
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024

// Center-crops the given image file to a square and re-encodes it as JPEG
// at a fixed size, so every profile picture is a predictable square
// regardless of the source image's aspect ratio — the sidebar badge (and
// anywhere else it's rendered) can then just show it at whatever size
// without cropping logic of its own. Returns a base64 string (no data URL
// prefix) ready to send to the admin-users Edge Function.
export async function cropImageToSquareBase64(file, size = PROFILE_PICTURE_SIZE) {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Image must be smaller than ${MAX_SOURCE_FILE_BYTES / (1024 * 1024)}MB.`)
  }

  const bitmap = await createImageBitmap(file)

  try {
    const cropSize = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - cropSize) / 2
    const sy = (bitmap.height - cropSize) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, size, size)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Failed to encode image'))),
        'image/jpeg',
        0.9
      )
    })

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })

    return dataUrl.split(',')[1]
  } finally {
    bitmap.close()
  }
}
