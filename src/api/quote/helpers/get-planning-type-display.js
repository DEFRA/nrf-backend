const planningTypeDisplayNames = {
  'full-planning-permission': 'Full planning permission',
  'outline-planning-permission': 'Outline planning permission',
  'hybrid-planning-permission': 'Hybrid planning permission'
}

export const getPlanningTypeDisplay = (planningType) =>
  planningTypeDisplayNames[planningType] ?? planningType
