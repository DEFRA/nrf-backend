import { boundaryGeojson } from './boundaryGeojson.js'

export const validQuotePayload = {
  planningType: 'full-planning-permission',
  boundaryEntryType: 'draw',
  boundaryGeojson,
  housingUnits: 10,
  email: 'developer@housebuilder.com'
}

export const levyCalculationHistory = {
  calculationDate: '2026-09-14T10:30:15.000Z',
  originalBaseAmount: 26750,
  baseChargePerUnit: 2675,
  originalBaseChargePerUnit: 2675,
  units: 10
}

export const validEdpsPayload = {
  edps: [
    {
      edpId: 123,
      edpName: 'Norfolk Fens east',
      edpStartDate: '2026-01-01',
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
      catchments: [
        {
          label: 'Broads SAC',
          catchmentId: '27',
          catchmentOverlapPercentage: 67.4
        },
        {
          label: 'River Wensum SAC',
          catchmentId: '29',
          catchmentOverlapPercentage: 32.6
        }
      ],
      levyGbp: {
        amountExcludingVat: 1100,
        amountInflationAdjusted: 1122,
        baseAmount: 1000,
        modelVersion: 1,
        ...levyCalculationHistory
      }
    }
  ]
}

export const commitmentLevy = {
  calculationDate: '2026-11-17T12:00:00.000Z',
  provisionalAmount: 30000,
  inflationAdjustedAmount: 30000,
  originalBaseAmount: 30000,
  baseChargePerUnit: 3000,
  originalBaseChargePerUnit: 3000,
  calculatorVersion: 1,
  units: 10
}
