import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import { VERIFICATION_MAX_DIMENSION } from "./proofPhoto.js";

const PERSON_SCORE_THRESHOLD = 0.25;
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

function toVerificationResult(predictions) {
  const personPredictions = predictions.filter(
    (prediction) =>
      prediction.class === "person" &&
      Number(prediction.score) >= PERSON_SCORE_THRESHOLD,
  );
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
    const scale = Math.min(
      1,
      VERIFICATION_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
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

    return await verifyPersonOnCanvas(canvas);
  } finally {
    bitmap.close();
  }
}

// Single-decode path (2026-09-19): runs detection on an already-prepared
// (already downscaled) canvas from prepareProofPhoto(), so the file is never
// decoded a second time at full resolution. Throws on invalid input —
// callers treat that as "unavailable" (still submittable), same as before.
export async function verifyPersonOnCanvas(canvas) {
  if (!canvas || !canvas.width || !canvas.height)
    throw new Error("No photo was selected.");

  const model = await getPersonModel();
  const predictions = await model.detect(canvas);
  return toVerificationResult(predictions);
}
