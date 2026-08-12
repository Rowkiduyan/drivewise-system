// Checked against the raw picked file, before any decoding/resizing — same
// reasoning as profilePicture.js's MAX_SOURCE_FILE_BYTES. The Edge Function
// enforces its own (smaller) cap on the processed output.
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024

// Proof-of-pickup/dropoff/stop photos aren't cropped to a fixed square the
// way profile pictures are (a package, doorway, or receipt isn't square) —
// just capped to this max dimension on the longer side and re-encoded as
// JPEG, preserving aspect ratio. Returns a base64 string (no data URL
// prefix) ready to send to the admin-users Edge Function.
export const MAX_PROOF_PHOTO_DIMENSION = 1600

export async function resizeProofPhotoToBase64(file, maxDimension = MAX_PROOF_PHOTO_DIMENSION) {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Image must be smaller than ${MAX_SOURCE_FILE_BYTES / (1024 * 1024)}MB.`)
  }

  const bitmap = await createImageBitmap(file)

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Failed to encode image'))),
        'image/jpeg',
        0.85
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
