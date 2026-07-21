import mediaMap from "./exercise-media-map.json";

const MEDIA_BASE_URL = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${mediaMap.commit}/videos/`;

const gifFiles: Record<string, string> = mediaMap.files;

export function getExerciseGifUrl(datasetId: string): string | undefined {
  const gifFileName = gifFiles[datasetId];
  const isKnownDatasetId = gifFileName !== undefined;

  if (!isKnownDatasetId) {
    return undefined;
  }

  return `${MEDIA_BASE_URL}${gifFileName}`;
}
