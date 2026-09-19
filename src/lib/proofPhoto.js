// Checked against the raw picked file, before any decoding/resizing — same
// reasoning as profilePicture.js's MAX_SOURCE_FILE_BYTES. The Edge Function
// enforces its own (smaller) cap on the processed output.
// Raised 2026-09-19 from 8MB to 15MB: ultra-HD phone photos (48-200MP)
// easily exceed 10MB. Safe because only the resized output (~<1MB) is ever
// uploaded — the server still caps processed output at 2MB. This gate exists
// only to avoid decoding a bitmap so large it OOMs low-end phones.
export const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024

// Proof-of-pickup/dropoff/stop photos aren't cropped to a fixed square the
// way profile pictures are (a package, doorway, or receipt isn't square) —
// just capped to this max dimension on the longer side and re-encoded as
// JPEG, preserving aspect ratio. Returns a base64 string (no data URL
// prefix) ready to send to the admin-users Edge Function.
export const MAX_PROOF_PHOTO_DIMENSION = 1600

// Person-detection input cap (2026-09-19): COCO-SSD was trained on
// ~300-600px inputs, so feeding it a 4000px canvas only burns RAM/time on
// old devices. Detection runs on this downscaled copy instead of full-res.
export const VERIFICATION_MAX_DIMENSION = 1024

function scaledDimensions(sourceWidth, sourceHeight, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

function drawScaled(bitmap, maxDimension) {
  const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to prepare the photo for checking.')
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)
  return canvas
}

async function canvasToBase64(canvas) {
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
}

export async function resizeProofPhotoToBase64(file, maxDimension = MAX_PROOF_PHOTO_DIMENSION) {
  const { base64 } = await prepareProofPhoto(file, {
    includeVerificationCanvas: false,
    maxDimension,
  })
  return base64
}

// Single-decode path (2026-09-19): decodes the file ONCE, then derives both
// the upload-sized base64 and (when requested) the downscaled detection
// canvas from that same bitmap. Previously resize + verification each did
// their own full-res createImageBitmap, doubling peak memory on old phones.
// The returned verificationCanvas is a plain canvas (GC'd, no close needed).
// fallbackCanvas is the upload-sized (<=1600px) canvas, returned so person
// detection can retry on it when the small copy misses (multiscale fallback
// in proofPhotoVerification.js) — same object, no extra decode or memory.
export async function prepareProofPhoto(file, options = {}) {
  const {
    includeVerificationCanvas = false,
    maxDimension = MAX_PROOF_PHOTO_DIMENSION,
    verificationMaxDimension = VERIFICATION_MAX_DIMENSION,
  } = options

  if (!file) throw new Error('No photo was selected.')
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Image must be smaller than ${MAX_SOURCE_FILE_BYTES / (1024 * 1024)}MB.`)
  }

  const bitmap = await createImageBitmap(file)

  try {
    const uploadCanvas = drawScaled(bitmap, maxDimension)

    let verificationCanvas = null
    if (includeVerificationCanvas) {
      verificationCanvas = drawScaled(bitmap, verificationMaxDimension)
    }

    const base64 = await canvasToBase64(uploadCanvas)
    return { base64, verificationCanvas, fallbackCanvas: uploadCanvas }
  } finally {
    bitmap.close()
  }
}
