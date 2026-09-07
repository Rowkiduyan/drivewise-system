import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";

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

// This is a local person-presence signal, not proof that an image came from a
// camera or that it has not been edited/generated. The result is deliberately
// advisory so a false negative cannot block delivery completion.
export async function verifyProofPhotoHasPerson(file) {
  if (!file) throw new Error("No photo was selected.");

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the photo for checking.");
    context.drawImage(bitmap, 0, 0);

    const model = await getPersonModel();
    const predictions = await model.detect(canvas);
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
  } finally {
    bitmap.close();
  }
}
