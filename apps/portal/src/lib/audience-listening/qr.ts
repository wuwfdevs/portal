// Renders an address as an inline SVG QR code, for the printed table cards. Pure (no DOM), so it runs on the server and in the
// browser. Error correction M: a card is printed and read off paper in a dim room, so it is generous without making the code dense.

import qrcode from "qrcode-generator";

export interface QrCode {
  /** Modules per side. */
  size: number;
  /** `dark[row][column]` */
  dark: boolean[][];
}

export function encodeQr(text: string): QrCode {
  const qr = qrcode(0, "M"); // type number 0: the smallest version that fits
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  const dark: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = [];
    for (let col = 0; col < size; col += 1) cells.push(qr.isDark(row, col));
    dark.push(cells);
  }
  return { size, dark };
}

/** One SVG path for every dark module, with a four-module quiet zone, as the QR specification asks. */
export function qrPath(code: QrCode, quiet = 4): { path: string; viewBox: string } {
  const parts: string[] = [];
  code.dark.forEach((cells, row) => {
    let col = 0;
    while (col < cells.length) {
      if (!cells[col]) {
        col += 1;
        continue;
      }
      let end = col;
      while (end < cells.length && cells[end]) end += 1;
      parts.push(`M${col + quiet} ${row + quiet}h${end - col}v1h${-(end - col)}z`);
      col = end;
    }
  });
  const side = code.size + quiet * 2;
  return { path: parts.join(""), viewBox: `0 0 ${side} ${side}` };
}
