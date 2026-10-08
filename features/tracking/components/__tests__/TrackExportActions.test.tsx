import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Alert, Switch } from 'react-native';
import { TrackExportActions } from '../TrackExportActions';
import i18n from '@/i18n/config';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockShare=jest.fn();
jest.mock('../../services/trackUserExportService',()=>({shareTrackUserExport:(...args:unknown[])=>mockShare(...args)}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
let renderer:any;
const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(<TrackExportActions data={{notes:'private'}}/>);});};
const press=(format:string)=>renderer.root.findAll((n:any)=>n.props.testID===`export-${format}`&&typeof n.props.onPress==='function')[0].props.onPress();
beforeEach(()=>{mockShare.mockReset();mockShare.mockResolvedValue(undefined);jest.spyOn(Alert,'alert').mockImplementation(()=>{});jest.spyOn(AccessibilityInfo,'announceForAccessibility').mockImplementation(()=>{});});
afterEach(()=>{act(()=>renderer?.unmount());jest.restoreAllMocks();});
it('notes are opt-in; buttons send only the selected format',async()=>{
  await mount();await act(async()=>press('pdf'));
  expect(mockShare).toHaveBeenLastCalledWith({notes:'private'},'pdf',expect.objectContaining({title:expect.any(String),confidenceLabels:expect.any(Object)}),false);
  act(()=>renderer.root.findByType(Switch).props.onValueChange(true));
  await act(async()=>press('gpx'));
  expect(mockShare).toHaveBeenLastCalledWith({notes:'private'},'gpx',expect.any(Object),true);
});
it('prevents duplicate exports even before React renders the disabled state',async()=>{
  let resolve!:()=>void;mockShare.mockReturnValue(new Promise<void>(r=>{resolve=r;}));
  await mount();act(()=>{press('pdf');press('pdf');});expect(mockShare).toHaveBeenCalledTimes(1);
  await act(async()=>resolve());
});
it('labels the selected export as busy, disables all formats and notes, then releases them',async()=>{
  let resolve!:()=>void;mockShare.mockReturnValue(new Promise<void>(r=>{resolve=r;}));
  await i18n.changeLanguage('de');await mount();act(()=>press('pdf'));
  const buttons=renderer.root.findAll((n:any)=>/^export-/.test(n.props.testID??'')&&typeof n.props.onPress==='function');
  expect(buttons).toHaveLength(3);
  expect(buttons.every((n:any)=>n.props.disabled)).toBe(true);
  expect(buttons[0].props.accessibilityState).toEqual({disabled:true,busy:true});
  expect(buttons[1].props.accessibilityState.busy).toBe(false);
  expect(renderer.root.findByType(Switch).props.disabled).toBe(true);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('PDF wird vorbereitet …');
  await act(async()=>resolve());
  expect(renderer.root.findByType(Switch).props.disabled).toBe(false);
});
it('uses the latest visible note and retains opt-in across all supported formats',async()=>{
  await mount();act(()=>renderer.root.findByType(Switch).props.onValueChange(true));
  await act(async()=>renderer.update(<TrackExportActions data={{notes:'visible unsaved note'}}/>));
  for(const format of ['pdf','gpx','json']){
    await act(async()=>press(format));
    expect(mockShare).toHaveBeenLastCalledWith({notes:'visible unsaved note'},format,expect.any(Object),true);
  }
  act(()=>renderer.root.findByType(Switch).props.onValueChange(false));
  await act(async()=>press('json'));
  expect(mockShare).toHaveBeenLastCalledWith(expect.any(Object),'json',expect.any(Object),false);
});
it('reports failure and permits retry',async()=>{
  mockShare.mockRejectedValueOnce(new Error('failure'));await mount();await act(async()=>press('json'));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await act(async()=>press('json'));expect(mockShare).toHaveBeenCalledTimes(2);
});
it('does not show a delayed error after leaving the screen',async()=>{
  let reject!:(reason:Error)=>void;mockShare.mockReturnValue(new Promise<void>((_,r)=>{reject=r;}));
  await mount();act(()=>press('pdf'));act(()=>renderer.unmount());await act(async()=>reject(new Error('late')));
  expect(Alert.alert).not.toHaveBeenCalled();
});
it.each(['de','gsw','en','fr','it'])('%s has translated export/report labels',async language=>{
  await i18n.changeLanguage(language);await mount();await act(async()=>press('pdf'));
  const labels=mockShare.mock.calls[0][2];
  expect(JSON.stringify(labels)).not.toMatch(/track\.(report|export|replay|material)/);
  expect(labels.source.length).toBeGreaterThan(20);
  const buttons=renderer.root.findAll((n:any)=>/^export-/.test(n.props.testID??'')&&typeof n.props.onPress==='function');
  for(const button of buttons){
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).not.toMatch(/track\.export/);
    expect(button.props.accessibilityHint).not.toMatch(/track\.export/);
    expect(button.props.accessibilityHint.length).toBeGreaterThan(10);
  }
  expect(renderer.root.findByType(Switch).props.accessibilityHint).toMatch(/PDF, GPX/);
});
