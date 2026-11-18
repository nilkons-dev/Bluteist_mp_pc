/** Choosing a picture for a playlist: pick an image file, crop it square from the centre, keep it small. */
export const COVER_SIZE = 320;

/** Resolves a JPEG data URL (about 20–40 KB), or null when the person cancels or the file is not a usable image. */
export function pickCoverImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
    input.style.display = "none";
    let settled = false;
    const done = (v: string | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener("cancel", () => done(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file || !file.type.startsWith("image/")) return done(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          if (!side) return done(null);
          const c = document.createElement("canvas");
          c.width = c.height = COVER_SIZE;
          const ctx = c.getContext("2d");
          if (!ctx) return done(null);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, COVER_SIZE, COVER_SIZE);
          ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
          done(c.toDataURL("image/jpeg", 0.86));
        } catch {
          done(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        done(null);
      };
      img.src = url;
    });
    document.body.appendChild(input);
    input.click();
  });
}
