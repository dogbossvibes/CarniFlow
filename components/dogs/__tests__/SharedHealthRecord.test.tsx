import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SharedHealthRecord } from '../SharedHealthRecord';
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: () => '29.10.2026' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/components/dogs/SharedDogsInbox', () => ({ styles: {} }));
it('does not expose free health notes through a weight grant even when present in legacy data', () => {
  let node!: ReactTestRenderer;
  const entries = [{ id: 'w', dog_id: 'd', weight_kg: 31, entry_date: '2026-10-29', note: 'private unrelated diagnosis', load_level: null, is_rest_day: false, is_intense: false, created_at: null }];
  act(() => { node = TestRenderer.create(<SharedHealthRecord item={{ id: 'weight:w', kind: 'weight', title: 'Weight', date: '2026-10-29', detail: '31 kg' }} data={{ entries, vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] }} />); });
  act(() => { node.root.findByType(TouchableOpacity).props.onPress(); });
  const text = node.root.findAll(n => (n as unknown as { type: unknown }).type === Text).map(n => n.props.children).join(' ');
  expect(text).toContain('31 kg');
  expect(text).not.toContain('private unrelated diagnosis');
  act(() => node.unmount());
});
