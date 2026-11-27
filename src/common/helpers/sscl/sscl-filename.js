/**
 * SSCL's agreed name for a file we push:
 * rainv_<fileType>_<UTC yyyymmddhhmiss>.dat.pgp, e.g. rainv_NRLINV_20261109173005.dat.pgp.
 * @param {{ fileType: 'NRLINV' | 'NRLCUST', time: Date }} params
 */
export const ssclFilename = ({ fileType, time }) => {
  const timestamp = time
    .toISOString()
    .replaceAll(/[-:T]/g, '')
    .replace(/\.\d+Z$/, '')
  return `rainv_${fileType}_${timestamp}.dat.pgp`
}
