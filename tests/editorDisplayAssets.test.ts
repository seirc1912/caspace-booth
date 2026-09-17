import assert from 'node:assert/strict'
import test from 'node:test'
import { editorDisplayAssetUrl } from '../client/src/features/templates/editorDisplayAssets'

test('published Supabase assets use the existing lightweight image transform endpoint', () => {
  const source = 'https://project.supabase.co/storage/v1/object/public/template-assets/frame/background.png'
  assert.equal(
    editorDisplayAssetUrl(source),
    'https://project.supabase.co/storage/v1/render/image/public/template-assets/frame/background.png?width=900&resize=contain&quality=80',
  )
})

test('non-Supabase asset URLs are left unchanged', () => {
  const source = 'https://images.example/frame.png'
  assert.equal(editorDisplayAssetUrl(source), source)
})
