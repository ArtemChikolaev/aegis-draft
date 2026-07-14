/** Golden fixtures привязаны к committed mock-baseline (`manifest.ratingModelVersion` mock-*). */
export function isMockBaseline(manifest: { ratingModelVersion?: string }): boolean {
  return manifest.ratingModelVersion?.startsWith("mock") ?? false;
}
