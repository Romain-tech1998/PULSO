import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { InstagramScoutReviewItem } from '@pulso/ingestion';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const ocrChildPath = fileURLToPath(
  new URL('./instagram-scout-ocr-child.mjs', import.meta.url)
);

export interface InstagramScoutVisualEvidence {
  attempted: boolean;
  assetMediaId?: string;
  sourceKind?: 'image' | 'video_thumbnail';
  ocrText?: string;
  ocrConfidence?: number;
  error?: string;
}

function preferredAsset(item: InstagramScoutReviewItem) {
  return item.mediaAssets?.find(
    (asset) =>
      asset.thumbnailUrl ||
      (asset.mediaType?.toUpperCase() !== 'VIDEO' && asset.mediaUrl)
  );
}

function visualUrl(asset: NonNullable<ReturnType<typeof preferredAsset>>) {
  if (asset.mediaType?.toUpperCase() === 'VIDEO') {
    return asset.thumbnailUrl;
  }
  return asset.mediaUrl ?? asset.thumbnailUrl;
}

async function prepareLanguageDirectory(baseDirectory: string) {
  const languageDirectory = join(baseDirectory, 'ocr-language-data');
  await mkdir(languageDirectory, { recursive: true });

  const englishModule = require.resolve('@tesseract.js-data/eng');
  const frenchModule = require.resolve('@tesseract.js-data/fra');
  await Promise.all([
    copyFile(
      join(dirname(englishModule), '4.0.0', 'eng.traineddata.gz'),
      join(languageDirectory, 'eng.traineddata.gz')
    ),
    copyFile(
      join(dirname(frenchModule), '4.0.0', 'fra.traineddata.gz'),
      join(languageDirectory, 'fra.traineddata.gz')
    )
  ]);
  return languageDirectory;
}

async function downloadAsset(
  url: string,
  fetchImpl: typeof fetch
): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`media download returned HTTP ${response.status}`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  return sharp(source, { failOn: 'none' })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: 'inside',
      withoutEnlargement: true
    })
    .greyscale()
    .normalize()
    .png()
    .toBuffer();
}

export async function extractInstagramScoutVisualEvidence(
  items: InstagramScoutReviewItem[],
  options: {
    workingDirectory: string;
    fetchImpl?: typeof fetch;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, InstagramScoutVisualEvidence>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const languageDirectory = await prepareLanguageDirectory(
    options.workingDirectory
  );
  const temporaryDirectory = join(options.workingDirectory, 'ocr-temporary');
  await mkdir(temporaryDirectory, { recursive: true });
  const results = new Map<string, InstagramScoutVisualEvidence>();
  let completed = 0;
  let cursor = 0;

  try {
    const processNext = async (): Promise<void> => {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) return;
      const asset = preferredAsset(item);
      const url = asset ? visualUrl(asset) : undefined;
      if (!asset || !url) {
        results.set(item.reviewId, {
          attempted: false,
          error: 'no image or video thumbnail returned by Meta'
        });
      } else {
        const imagePath = join(temporaryDirectory, `${randomUUID()}.png`);
        try {
          const image = await downloadAsset(url, fetchImpl);
          await writeFile(imagePath, image);
          const { stdout } = await execFileAsync(
            process.execPath,
            [ocrChildPath, languageDirectory, imagePath],
            { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
          );
          const recognition = JSON.parse(stdout) as {
            text: string;
            confidence: number;
          };
          const text = recognition.text.replace(/\s+/g, ' ').trim();
          results.set(item.reviewId, {
            attempted: true,
            assetMediaId: asset.mediaId,
            sourceKind:
              asset.mediaType?.toUpperCase() === 'VIDEO'
                ? 'video_thumbnail'
                : 'image',
            ...(text ? { ocrText: text } : {}),
            ocrConfidence: recognition.confidence
          });
        } catch (error) {
          results.set(item.reviewId, {
            attempted: true,
            assetMediaId: asset.mediaId,
            error:
              error instanceof Error
                ? (error.message.split(/\r?\n/u)[0] ?? 'OCR process failed')
                : String(error)
          });
        } finally {
          await rm(imagePath, { force: true });
        }
      }
      completed += 1;
      options.onProgress?.(completed, items.length);
      await processNext();
    };

    const concurrency = Math.min(4, items.length);
    await Promise.all(
      Array.from({ length: concurrency }, async () => processNext())
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return results;
}
