import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Switch } from 'react-native';
import { TrackExportActions } from '../TrackExportActions';
import i18n from '@/i18n/config';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockShare=jest.fn();
jest.mock('../../services/trackUserExportService',()=>({shareTrackUserExport:(...args:unknown[])=>mockShare(...args)}));
let renderer:any;
const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(<TrackExportActions data={{notes:'private'}}/>);});};
const press=(format:string)=>renderer.root.findAll((n:any)=>n.props.testID===`export-${format}`&&typeof n.props.onPress==='function')[0].props.onPress();
beforeEach(()=>{mockShare.mockReset();mockShare.mockResolvedValue(undefined);jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
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
});
