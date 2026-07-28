import { createWorker } from 'tesseract.js';

const [, , languageDirectory, imagePath] = process.argv;
if (!languageDirectory || !imagePath) {
  process.exitCode = 2;
} else {
  const worker = await createWorker('eng+fra', 1, {
    langPath: languageDirectory,
    logger: () => undefined
  });
  try {
    const recognition = await worker.recognize(imagePath);
    process.stdout.write(
      JSON.stringify({
        text: recognition.data.text,
        confidence: recognition.data.confidence
      })
    );
  } finally {
    await worker.terminate();
  }
}
