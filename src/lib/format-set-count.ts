/** "1 serie" / "3 series". */
export function formatSetCount(setCount: number): string {
  const isSingular = setCount === 1;
  return isSingular ? "1 serie" : `${setCount} series`;
}
