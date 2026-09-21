/**
 * @param {Array<{levyGbp: {amountExcludingVat: string, amountInflationAdjusted: string}}>} edps
 * @returns {{ levyAmountExcludingVat: number, levyAmountInflationAdjusted: number }}
 */
export const getLevyAmount = (edps) => {
  const levyAmountExcludingVat = edps.reduce(
    (acc, edp) => acc + Number(edp.levyGbp.amountExcludingVat),
    0
  )
  const levyAmountInflationAdjusted = edps.reduce(
    (acc, edp) => acc + Number(edp.levyGbp.amountInflationAdjusted),
    0
  )
  return { levyAmountExcludingVat, levyAmountInflationAdjusted }
}
