import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {WarmupMapPreview} from '../WarmupMapPreview';
import {TrackingMap} from '../TrackingMap';
jest.mock('../TrackingMap',()=>({TrackingMap:()=>null}));
let tree:ReturnType<typeof TestRenderer.create>;
afterEach(()=>act(()=>tree?.unmount()));
it('waits for a position instead of showing an invented fallback location',()=>{
 act(()=>{tree=TestRenderer.create(<WarmupMapPreview position={null}/>);});
 expect(()=>tree.root.findByType(TrackingMap)).toThrow();
});
it('shows the warmup position in a bounded map without another user-location request or recorded line',()=>{
 const position={lat:47,lng:8};
 act(()=>{tree=TestRenderer.create(<WarmupMapPreview position={position}/>);});
 const map=tree.root.findByType(TrackingMap);
 expect(map.props.currentPosition).toBe(position);expect(map.props.layPoints).toEqual([]);
 expect(map.props.showUserLocation).toBe(false);expect(map.props.follow).toBe(true);
 act(()=>tree.update(<WarmupMapPreview position={{lat:47.001,lng:8}}/>));
 expect(tree.root.findByType(TrackingMap)).toBe(map);
});
