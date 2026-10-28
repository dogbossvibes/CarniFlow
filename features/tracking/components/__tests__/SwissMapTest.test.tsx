import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import { Modal, UIManager, StyleSheet } from 'react-native';
import { SwissMapTest, SWISSIMAGE_TEST_URL } from '../SwissMapTest';
import { RNMaps } from '@/components/tracking/TrackMap';
jest.mock('@/components/tracking/TrackMap',()=>({MAPS_AVAILABLE:true,RNMaps:{default:({children}:any)=>children,UrlTile:()=>null}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:({children}:any)=>children,useSafeAreaInsets:()=>({top:59,bottom:34,left:0,right:0})}));
let tree:ReturnType<typeof TestRenderer.create>;
afterEach(()=>{act(()=>tree?.unmount());jest.restoreAllMocks();});
const press=(text:string)=>act(()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===text)[0].props.onPress());
it('does not mount a map until explicitly opened, never requests location and unmounts on close',()=>{
 jest.spyOn(UIManager,'getViewManagerConfig').mockReturnValue({} as any);
 act(()=>{tree=TestRenderer.create(<SwissMapTest/>);});
 expect(()=>tree.root.findByType(RNMaps!.default)).toThrow();
 press('Luftbilder testen');
 expect(tree.root.findByType(RNMaps!.default).props.showsUserLocation).toBe(false);
 expect(tree.root.findByType(RNMaps!.UrlTile).props.urlTemplate).toBe(SWISSIMAGE_TEST_URL);
 expect(tree.root.findByType(RNMaps!.UrlTile).props.shouldReplaceMapContent).toBe(false);
 press('Standardkarte anzeigen');expect(()=>tree.root.findByType(RNMaps!.UrlTile)).toThrow();
 act(()=>tree.root.findByType(Modal).props.onRequestClose());
 expect(()=>tree.root.findByType(RNMaps!.default)).toThrow();
});
it('does not offer the test when the installed native tile manager is absent',()=>{
 jest.spyOn(UIManager,'getViewManagerConfig').mockReturnValue(null as any);
 act(()=>{tree=TestRenderer.create(<SwissMapTest/>);});
 expect(tree.root.findAll(n=>typeof n.props.children==='string'&&n.props.children.includes('nicht unterstützt')).length).toBeGreaterThan(0);
 expect(()=>tree.root.findByType(RNMaps!.default)).toThrow();
});

it('keeps the close control below the status bar and closes using its visible button',()=>{
 jest.spyOn(UIManager,'getViewManagerConfig').mockReturnValue({} as any);
 act(()=>{tree=TestRenderer.create(<SwissMapTest/>);});press('Luftbilder testen');
 const header=tree.root.findAll(n=>n.props.testID==='swiss-map-header')[0];
 expect(StyleSheet.flatten(header.props.style).paddingTop).toBe(67);
 expect(StyleSheet.flatten(header.props.style).flexShrink).toBe(0);
 press('Luftbild-Test schließen');
 expect(tree.root.findByType(Modal).props.visible).toBe(false);
 expect(()=>tree.root.findByType(RNMaps!.default)).toThrow();
});
