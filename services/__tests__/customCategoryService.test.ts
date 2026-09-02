/* eslint-disable import/first */
// Eigene Trainings-Sparte („Kegelgruppe umrunden"-Auftrag, Folgeauftrag: Custom
// Discipline). Belegt: Persistenz läuft über die bereits existierende, in
// Production bereits live geschaltete `custom_categories`-Tabelle (RLS-Policy
// `owner_custom_categories`, owner_id = auth.uid()) — KEINE neue Tabelle/
// Migration nötig. Jede Schreiboperation ist eindeutig auf den Owner beschränkt.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '@/lib/supabase';
import {
  getCustomCategories, createCustomCategory, updateCustomCategory, deleteCustomCategory,
} from '@/services/customCategoryService';

const from = supabase.from as unknown as jest.Mock;

describe('customCategoryService — Persistenz der eigenen Sparte', () => {
  afterEach(() => from.mockReset());

  it('getCustomCategories liest ausschliesslich die Kategorien des angegebenen Owners', () => {
    const order = jest.fn().mockResolvedValue({ data: [], error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    from.mockReturnValue({ select });

    getCustomCategories('user-1');

    expect(from).toHaveBeenCalledWith('custom_categories');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('createCustomCategory schreibt name/icon/color/exercises + owner_id in custom_categories', () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'new-cat' }, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    from.mockReturnValue({ insert });

    createCustomCategory('user-1', { name: 'Fitness', icon: 'barbell', color: '#A78BFA', exercises: [] });

    expect(from).toHaveBeenCalledWith('custom_categories');
    expect(insert).toHaveBeenCalledWith({
      name: 'Fitness', icon: 'barbell', color: '#A78BFA', exercises: [], owner_id: 'user-1',
    });
  });

  it('updateCustomCategory ändert nur die übergebene Kategorie (per id, keine owner-übergreifende Query)', () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'cat-1' }, error: null });
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn(() => ({ eq }));
    from.mockReturnValue({ update });

    updateCustomCategory('cat-1', { name: 'Fitness Pro', icon: 'barbell', color: '#A78BFA', exercises: ['Liegestütze'] });

    expect(update).toHaveBeenCalledWith({ name: 'Fitness Pro', icon: 'barbell', color: '#A78BFA', exercises: ['Liegestütze'] });
    expect(eq).toHaveBeenCalledWith('id', 'cat-1');
  });

  it('deleteCustomCategory löscht per id — keine Kaskade auf bestehende Trainings (kein Fremdschlüssel dorthin)', () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn(() => ({ eq }));
    from.mockReturnValue({ delete: del });

    deleteCustomCategory('cat-1');

    expect(from).toHaveBeenCalledWith('custom_categories');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'cat-1');
  });
});
