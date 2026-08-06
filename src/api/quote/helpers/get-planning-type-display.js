const planningTypeDisplayNames = {
  'full-planning-permission': 'full planning permission',
  'outline-planning-permission': 'outline planning permission',
  'hybrid-planning-permission': 'hybrid planning permission'
}

export const getPlanningTypeDisplay = (planningType) =>
  planningTypeDisplayNames[planningType] ?? planningType
