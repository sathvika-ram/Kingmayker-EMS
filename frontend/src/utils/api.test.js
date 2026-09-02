import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiBaseUrl } from './api.js';

test('uses the local backend for local hostnames', () => {
  assert.equal(getApiBaseUrl('localhost'), 'http://localhost:5000');
  assert.equal(getApiBaseUrl('127.0.0.1'), 'http://localhost:5000');
  assert.equal(getApiBaseUrl('::1'), 'http://localhost:5000');
});

test('uses the deployed backend for remote hostnames', () => {
  assert.equal(getApiBaseUrl('example.com'), 'https://kingmayker-ems.onrender.com');
});
