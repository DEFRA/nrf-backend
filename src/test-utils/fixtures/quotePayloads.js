import { boundaryGeojson } from './boundaryGeojson.js'

export const validQuotePayload = {
  planningType: 'full-planning-permission',
  boundaryEntryType: 'draw',
  boundaryGeojson,
  housingUnits: 10,
  email: 'developer@housebuilder.com'
}

// Derived, not copied: a quote created from validQuotePayload has a
// placeholder under this name, and a literal here would drift silently.
export const PLACEHOLDER_EDP_NAME = boundaryGeojson.intersectingEdps[0].label

export const validEdpsPayload = {
  edps: [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpType: 'NUTRIENT',
      impact: {
        nitrogenTotal: {
          amount: 80,
          unit: 'mg/I TP',
          band: { min: 1, max: 3 }
        },
        phosphorusTotal: {
          amount: 60,
          unit: 'mg/I TP',
          band: { min: 1, max: 4 }
        }
      },
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1
      }
    }
  ]
}

// One EDP the boundary check reported and one it did not: the fill path and
// the insert path in a single callback.
export const twoEdpPayload = {
  edps: [
    { ...validEdpsPayload.edps[0], edpId: 111, edpName: PLACEHOLDER_EDP_NAME },
    { ...validEdpsPayload.edps[0], edpId: 222, edpName: 'Broads west' }
  ]
}
