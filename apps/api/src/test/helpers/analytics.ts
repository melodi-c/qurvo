export function sumSeriesValues(data: { value: number }[]): number {
  return data.reduce((sum, d) => sum + d.value, 0);
}
