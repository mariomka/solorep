export function formatCountdown(seconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;
  const minutesText = String(minutes).padStart(2, "0");
  const secondsText = String(remainingSeconds).padStart(2, "0");

  return `${minutesText}:${secondsText}`;
}
