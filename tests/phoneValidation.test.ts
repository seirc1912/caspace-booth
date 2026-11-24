import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidPhoneNumber, normalizePhoneNumber } from '../client/src/features/orders/phoneNumber.ts'

test('only full 10-digit Vietnamese mobile numbers are valid (9 digits is not)', () => {
  for (const ok of ['0906341807', '0906 341 807', '+84 906 341 807', '84906341807', '0356650134']) assert.equal(isValidPhoneNumber(ok), true, ok)
  for (const bad of ['090634180', '0906 341 80', '09063418071', '0206341807', '123456789', '+1 415 555 0100', '']) assert.equal(isValidPhoneNumber(bad), false, bad)
  assert.equal(normalizePhoneNumber('+84 906 341 807'), '0906341807')
})
