import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSiteBranding } from '../client/src/services/branding/mergeSiteBranding'

test('retired admin settings are dropped so the next save removes them', () => {
  const merged = mergeSiteBranding({ homeHeadline: 'Xin chào', badgeText: 'Preserve your memories.', homeStepLabel: 'x', phoneHelper: 'y', secondaryColor: '#000', backgroundColor: '#fff', backgroundImageUrl: 'https://a/b', backgroundSize: 'cover', backgroundPosition: 'center', backgroundOverlay: 0.3 })
  assert.equal(merged.homeHeadline, 'Xin chào')
  for (const key of ['badgeText', 'homeStepLabel', 'phoneHelper', 'secondaryColor', 'backgroundColor', 'backgroundImageUrl', 'backgroundSize', 'backgroundPosition', 'backgroundOverlay']) assert.equal(key in merged, false, key)
})

test('non-https links are still blanked', () => {
  assert.equal(mergeSiteBranding({ facebookUrl: 'javascript:alert(1)' }).facebookUrl, '')
})
