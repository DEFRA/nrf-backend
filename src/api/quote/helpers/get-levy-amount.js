export const getLevyAmount = (edps) => {
  const totalMin = edps.reduce((acc, edp) => acc + Number(edp.levyGbp.min), 0)
  const totalMax = edps.reduce((acc, edp) => acc + Number(edp.levyGbp.max), 0)
  if (totalMax > totalMin) {
    return `£${totalMin} - £${totalMax}`
  }
  return `£${totalMin}`
}
