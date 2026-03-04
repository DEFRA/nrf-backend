import shpjs from 'shpjs'
import { DOMParser } from '@xmldom/xmldom'
import toGeoJSON from '@mapbox/togeojson'

const parseGeoJSON = (fileContents) => {
  const data =
    typeof fileContents === 'string'
      ? JSON.parse(fileContents)
      : JSON.parse(fileContents.toString())

  if (data.type === 'FeatureCollection') {
    const features = data.features ?? []
    if (features.length === 0) {
      throw new Error('GeoJSON FeatureCollection contains no features')
    }
    return features[0].geometry
  }

  if (data.type === 'Feature') {
    return data.geometry
  }

  return data
}

const parseShapefile = async (fileContents) => {
  const geojson = await shpjs(fileContents)

  const features = Array.isArray(geojson)
    ? geojson[0]?.features
    : geojson.features

  if (!features || features.length === 0) {
    throw new Error('Shapefile contains no features')
  }

  return features[0].geometry
}

const parseKml = (fileContents) => {
  const xmlString =
    typeof fileContents === 'string'
      ? fileContents
      : fileContents.toString()

  const dom = new DOMParser().parseFromString(xmlString)
  const geojson = toGeoJSON.kml(dom)

  const features = geojson.features ?? []
  if (features.length === 0) {
    throw new Error('KML contains no features')
  }

  return features[0].geometry
}

const getExtension = (fileKey) => {
  const match = fileKey.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

export const parseBoundaryFile = async (fileKey, fileContents) => {
  const ext = getExtension(fileKey)

  switch (ext) {
    case 'geojson':
    case 'json':
      return parseGeoJSON(fileContents)
    case 'zip':
      return parseShapefile(fileContents)
    case 'kml':
      return parseKml(fileContents)
    default:
      throw new Error(`Unsupported file format: .${ext}`)
  }
}
