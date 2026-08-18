import jsQR from 'jsqr';

/**
 * DEC-0022 §3. Reading a ticket QR from the device camera.
 *
 * Two decoders, one loop. `BarcodeDetector` is native in Chrome and Android
 * WebView, hardware-accelerated, and noticeably better in the low light of an
 * actual door; it does not exist in Safari or Firefox, where jsQR runs over
 * the same frames. The caller sees one interface either way.
 *
 * Kept out of explore-map.tsx because it is the part with a resource to
 * release: a camera left running after the panel closes is a light on
 * someone's phone and a battery they notice.
 */

export type QrCameraFailure = 'denied' | 'unavailable';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

async function createNativeDetector(): Promise<
  BarcodeDetectorLike | undefined
> {
  const candidate = (
    globalThis as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;
  if (!candidate) return undefined;
  try {
    // Presence of the constructor does not imply QR support: some builds
    // ship it with a formats list that excludes qr_code.
    const formats = await candidate.getSupportedFormats?.();
    if (formats && !formats.includes('qr_code')) return undefined;
    return new candidate({ formats: ['qr_code'] });
  } catch {
    return undefined;
  }
}

export interface QrCameraSession {
  stop: () => void;
}

/**
 * Starts the camera and calls `onToken` for each distinct QR it reads.
 *
 * The same code stays in frame for many consecutive frames, so a repeat of
 * the value just reported is swallowed - otherwise one ticket held up at the
 * door would post thirty scans a second, and the second of those would come
 * back "already used" against the admission the first one just made.
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  onToken: (token: string) => void
): Promise<QrCameraSession | QrCameraFailure> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // The back camera on a phone; ignored on a laptop, which has one.
      video: { facingMode: 'environment' }
    });
  } catch {
    return 'denied';
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  try {
    await video.play();
  } catch {
    // Autoplay refusal is not fatal: the frames still arrive once the user
    // interacts, and the loop below simply reads nothing until they do.
  }

  const detector = await createNativeDetector();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  let stopped = false;
  let lastToken: string | undefined;
  let frame = 0;

  const report = (value: string) => {
    if (value === lastToken) return;
    lastToken = value;
    onToken(value);
  };

  const tick = async () => {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        if (detector) {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) report(found[0].rawValue);
        } else if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert'
          });
          if (found?.data) report(found.data);
        }
      } catch {
        // A single unreadable frame is the normal case while someone is
        // still lining up their phone, not an error worth surfacing.
      }
    }
    frame = requestAnimationFrame(() => void tick());
  };

  frame = requestAnimationFrame(() => void tick());

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    }
  };
}
