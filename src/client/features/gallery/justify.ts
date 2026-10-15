/**
 * Justified rows (Google Photos style): fill each row edge to edge by scaling its height,
 * keeping every image's aspect ratio. The last row keeps the target height.
 */
export interface JustifiedItem<T> {
  item: T;
  width: number;
  height: number;
}

export function justify<T>(
  items: T[],
  ratioOf: (item: T) => number,
  containerWidth: number,
  targetHeight: number,
  gap: number,
): Array<Array<JustifiedItem<T>>> {
  const rows: Array<Array<JustifiedItem<T>>> = [];
  if (containerWidth <= 0) return rows;
  let row: T[] = [];
  let ratioSum = 0;
  const flush = (last: boolean) => {
    if (!row.length) return;
    const gaps = gap * (row.length - 1);
    const h = last
      ? Math.min(targetHeight, (containerWidth - gaps) / ratioSum)
      : (containerWidth - gaps) / ratioSum;
    rows.push(row.map((item) => ({ item, height: h, width: h * ratioOf(item) })));
    row = [];
    ratioSum = 0;
  };
  for (const item of items) {
    row.push(item);
    ratioSum += ratioOf(item);
    if (ratioSum * targetHeight + gap * (row.length - 1) >= containerWidth) flush(false);
  }
  flush(true);
  return rows;
}
