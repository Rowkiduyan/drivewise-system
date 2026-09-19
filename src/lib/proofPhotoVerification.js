import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import {
  MAX_PROOF_PHOTO_DIMENSION,
  VERIFICATION_MAX_DIMENSION,
} from "./proofPhoto.js";

// Lowered 2026-09-19 from 0.25 to 0.15 after a field false-negative report
// (photo with a person scored below 0.25). Safe because the result is
// advisory-only: a false positive just shows PASS on a non-blocking label,
// while a false negative confuses the helper with FAILED.
const PERSON_SCORE_THRESHOLD = 0.15;
let modelPromise;

function getPersonModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.ready();
      if (tf.getBackend() !== "webgl") {
        try {
          await tf.setBackend("webgl");
        } catch {
          await tf.setBackend("cpu");
        }
        await tf.ready();
      }
      return cocoSsd.load();
    })().catch((error) => {
      modelPromise = undefined;
      throw error;
    });
  }
  return modelPromise;
}

function filterPersonPredictions(predictions) {
  return predictions.filter(
    (prediction) =>
      prediction.class === "person" &&
      Number(prediction.score) >= PERSON_SCORE_THRESHOLD,
  );
}

function toVerificationResult(predictions) {
  const personPredictions = filterPersonPredictions(predictions);
  const confidence = personPredictions.length
    ? Math.max(...personPredictions.map((prediction) => prediction.score))
    : 0;

  return {
    status: personPredictions.length > 0 ? "verified" : "uncertain",
    personDetected: personPredictions.length > 0,
    confidence,
    checkedAt: new Date().toISOString(),
    method: "local-coco-ssd",
  };
}

function drawScaledCanvas(bitmap, maxDimension) {
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to prepare the photo for checking.");
  context.drawImage(
    bitmap,
    0,
    0,
    bitmap.width,
    bitmap.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

// This is a local person-presence signal, not proof that an image came from a
// camera or that it has not been edited/generated. The result is deliberately
// advisory so a false negative cannot block delivery completion.
export async function verifyProofPhotoHasPerson(file) {
  if (!file) throw new Error("No photo was selected.");

  // Downscaled detection path (2026-09-19): COCO-SSD was trained on
  // ~300-600px inputs, so detecting on a <=1024px copy matches full-res
  // accuracy while using ~10x less memory on old phones. Previously this
  // drew the bitmap at full resolution.
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = drawScaledCanvas(bitmap, VERIFICATION_MAX_DIMENSION);
    const fallbackCanvas = drawScaledCanvas(bitmap, MAX_PROOF_PHOTO_DIMENSION);

    return await verifyPersonOnCanvas(canvas, fallbackCanvas);
  } finally {
    bitmap.close();
  }
}

// Single-decode path (2026-09-19): runs detection on an already-prepared
// (already downscaled) canvas from prepareProofPhoto(), so the file is never
// decoded a second time at full resolution. Throws on invalid input —
// callers treat that as "unavailable" (still submittable), same as before.
//
// Multiscale fallback (2026-09-19, field false-negative fix): if the small
// canvas finds no person, retries ONCE on fallbackCanvas (the larger
// <=1600px upload-sized copy — small/distant persons survive better there)
// before conceding uncertain. A retry failure (e.g. old-device OOM) keeps
// the primary result, so this can only flip uncertain→verified, never the
// reverse, and never throws.
export async function verifyPersonOnCanvas(canvas, fallbackCanvas = null) {
  if (!canvas || !canvas.width || !canvas.height)
    throw new Error("No photo was selected.");

  const model = await getPersonModel();
  let predictions = await model.detect(canvas);

  if (
    filterPersonPredictions(predictions).length === 0 &&
    fallbackCanvas &&
    fallbackCanvas.width &&
    fallbackCanvas.height
  ) {
    try {
      const retryPredictions = await model.detect(fallbackCanvas);
      if (filterPersonPredictions(retryPredictions).length > 0) {
        predictions = retryPredictions;
      }
    } catch {
      // Keep the primary (uncertain) result.
    }
  }

  return toVerificationResult(predictions);
}
