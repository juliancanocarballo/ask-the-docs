export const SHOW_EMAIL_CAPTURE_MARKER = "<!--SHOW_EMAIL_CAPTURE-->";

export function hasEmailCaptureMarker(text: string): boolean {
  return text.includes(SHOW_EMAIL_CAPTURE_MARKER);
}

export function stripMarkers(text: string): string {
  return text.replace(SHOW_EMAIL_CAPTURE_MARKER, "").trimEnd();
}
