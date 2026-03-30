export const getDevelopmentDescription = (development) => {
  const { types, residentialBuildingCount, peopleCount } = development
  const hasHousing = types.includes('housing')
  const hasOtherResidential = types.includes('other-residential')
  const units = `${residentialBuildingCount} residential unit${residentialBuildingCount === 1 ? '' : 's'}`
  if (hasHousing && hasOtherResidential) {
    return `Housing with ${units} and a development with a maximum number of ${peopleCount} people`
  }
  if (hasHousing) {
    return `Housing with a total of ${units}`
  }
  return `A development with a maximum number of ${peopleCount} people`
}
