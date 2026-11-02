/**
 * Saves an in-memory blob under a chosen filename. Used by the transcript
 * .txt export and the clips archive, both of which are built or fetched by
 * the browser rather than handed over as a signed storage URL (which carries
 * its own filename — see clip-rail's openDownload).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the save in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
