/**
 * Photos of paper sheets, kept in the pool's own Storage bucket (DECISIONS.md D-029) so a dispute
 * is settled by the sheet (PERSONAS: Rosalie). Admin only (storage.rules). The Storage SDK is
 * loaded here on demand, so players never download it.
 */
import { PAPER_SHEETS_BUCKET } from '@shared/config';
import { paperPhotoFolder } from '@shared/paperEntry';
import { app } from './firebase';

const MAX_EDGE = 1600; // enough to read handwriting, small enough for a weak signal at the counter
const JPEG_QUALITY = 0.8;

async function storage() {
  const { connectStorageEmulator, getStorage } = await import('firebase/storage');
  const instance = getStorage(app, `gs://${PAPER_SHEETS_BUCKET}`);
  if (import.meta.env.VITE_USE_EMULATORS === 'true' && !connected) {
    connectStorageEmulator(instance, '127.0.0.1', 9199);
    connected = true;
  }
  return instance;
}
let connected = false;

/** Shrink a phone photo to a JPEG about 1600px on its long edge. Falls back to the original file. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file; // a format this browser can't draw: the rules still check type and size
  }
}

/** Upload the photo and return its Storage path, to save on the entry as `paperPhotoPath`. */
export async function uploadPaperPhoto(
  file: File,
  where: { year: string; weekId: string; playerId: string },
): Promise<string> {
  const { ref, uploadBytes } = await import('firebase/storage');
  const blob = await shrinkPhoto(file);
  const extension = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${paperPhotoFolder(where.year, where.weekId)}${where.playerId}-${Date.now()}.${extension}`;
  await uploadBytes(ref(await storage(), path), blob, {
    contentType: blob.type || 'image/jpeg',
  });
  return path;
}

/** A link the admin's browser can open to look at the stored photo. */
export async function paperPhotoUrl(path: string): Promise<string> {
  const { getDownloadURL, ref } = await import('firebase/storage');
  return getDownloadURL(ref(await storage(), path));
}
