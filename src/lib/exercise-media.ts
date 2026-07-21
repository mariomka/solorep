import mediaMap from "./exercise-media-map.json";

const MEDIA_BASE_URL = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${mediaMap.commit}/videos/`;

const gifFiles: Record<string, string> = mediaMap.files;

export function getExerciseGifUrl(mediaId: string): string | undefined {
  const gifFileName = gifFiles[mediaId];
  const isKnownMediaId = gifFileName !== undefined;

  if (!isKnownMediaId) {
    return undefined;
  }

  return `${MEDIA_BASE_URL}${gifFileName}`;
}
