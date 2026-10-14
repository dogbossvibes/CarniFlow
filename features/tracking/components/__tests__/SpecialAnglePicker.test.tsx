import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {SpecialAnglePicker} from '../SpecialAnglePicker';
jest.mock('@/i18n',()=>({useT:()=>({t:(k:string)=>k})}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:(k:string)=>k})}));
jest.mock('@/features/training-groups/registerResources',()=>({registerGroupResources:jest.fn()}));
let tree:ReturnType<typeof Renderer.create>;
afterEach(()=>act(()=>tree?.unmount()));
function press(label:string){act(()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===label)[0].props.onPress());}
it.each(['BW','OW','GW'])('%s selects type then sharp-right geometry without creating an extra marker',label=>{
 const onSelect=jest.fn();act(()=>{tree=Renderer.create(<SpecialAnglePicker onSelect={onSelect}/>);});
 press(label);expect(onSelect).not.toHaveBeenCalled();press('track.detailSharpRight');
 expect(onSelect).toHaveBeenCalledTimes(1);expect(onSelect).toHaveBeenCalledWith(label.toLowerCase(),{geometryDirection:'rechts',geometrySharpness:'sharp',geometrySource:'manual'});
});
it('Abriss offers explicit left/right only; returning creates nothing',()=>{
 const onSelect=jest.fn();act(()=>{tree=Renderer.create(<SpecialAnglePicker onSelect={onSelect}/>);});press('track.angleBreak');
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='auto')).toHaveLength(0);
 press('back');expect(onSelect).not.toHaveBeenCalled();press('track.angleBreak');press('track.detailLeft');
 expect(onSelect).toHaveBeenCalledWith('abriss',{geometryDirection:'links',geometrySharpness:'unresolved',geometrySource:'manual'});
});
it('automatic BW keeps direction unset until actual geometry exists',()=>{
 const onSelect=jest.fn();act(()=>{tree=Renderer.create(<SpecialAnglePicker onSelect={onSelect}/>);});press('BW');press('auto');expect(onSelect).toHaveBeenCalledWith('bw');
});

it('accepts a direction once even when a queued second tap arrives',()=>{
 const onSelect=jest.fn();act(()=>{tree=Renderer.create(<SpecialAnglePicker onSelect={onSelect}/>);});press('BW');
 press('track.detailRight');press('track.detailRight');expect(onSelect).toHaveBeenCalledTimes(1);
});
