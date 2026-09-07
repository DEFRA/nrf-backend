export const boundaryGeojson = {
  boundaryGeometryOriginal: {
    type: 'Polygon',
    coordinates: [
      [
        [582814.9267999995, 328188.88990000077],
        [582808.8858000003, 328203.7290000003],
        [582824.9649, 328210.16789999977],
        [582830.0904000001, 328196.99540000036],
        [582814.9267999995, 328188.88990000077]
      ]
    ],
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:EPSG::27700'
      }
    }
  },
  intersectingEdps: [
    {
      label: 'River Wensum SAC Environmental Delivery Plan (2026 to 2036)',
      overlapAreaHa: 667.9304,
      overlapAreaSqm: 6679304.0,
      overlapPercentage: 100.0,
      catchments: [
        { label: 'Broads SAC', catchmentOverlapPercentage: 67.4 },
        { label: 'River Wensum SAC', catchmentOverlapPercentage: 32.6 }
      ]
    }
  ],
  intersectingExcludedAreas: []
}
