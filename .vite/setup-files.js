vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn(),
  enableAuditing: vi.fn()
}))
