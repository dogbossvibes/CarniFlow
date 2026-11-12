import React from 'react';
import renderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import { Keyboard, ScrollView, TextInput } from 'react-native';
import { CreateEventModal } from '../CreateEventModal';
import { event } from '@/features/calendar/__tests__/fixture';
const mockScroll=jest.fn(),mockViewport=jest.fn();
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView',()=>{
  const R=jest.requireActual('react');
  return {__esModule:true,default:R.forwardRef(function Scroll(props:object,ref:unknown){
    R.useImperativeHandle(ref,()=>({scrollTo:mockScroll,getNativeScrollRef:()=>({measureInWindow:mockViewport})}));
    return R.createElement('ScrollView',props);
  })};
});
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:{user:{id:'owner-a'}}})}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>key})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeArea',useSafeAreaInsets:()=>({top:44,bottom:34,left:0,right:0})}));
jest.mock('@/services/calendarService',()=>({createOwnEvent:jest.fn(),updateOwnCalendarEvent:jest.fn()}));
jest.mock('@/lib/eventReminders',()=>({scheduleEventReminders:jest.fn()}));
jest.mock('@/lib/deviceCalendar',()=>({DEVICE_CALENDAR_AVAILABLE:false,addEventToDeviceCalendar:jest.fn()}));
jest.mock('../AppointmentTypeGrid',()=>({AppointmentTypeGrid:()=>null}));
jest.mock('../DogSelectionCards',()=>({DogSelectionCards:()=>null}));
jest.mock('../LocationPickerCard',()=>({LocationPickerCard:()=>null}));
jest.mock('../ReminderCard',()=>({ReminderCard:()=>null}));
jest.mock('../ConnectedTrainerSelector',()=>({ConnectedTrainerSelector:()=>null}));
jest.mock('../StickyCreateAppointmentButton',()=>({StickyCreateAppointmentButton:()=>null}));
jest.mock('@/components/ui/DateField',()=>({DateField:()=>null}));
let tree:ReactTestRenderer;
let input:{measureInWindow:jest.Mock};
let focused:typeof input;
let frame:(()=>void)|undefined;
let listeners:Record<string,(value?:unknown)=>void>;
const close=jest.fn();
const scroll=()=>tree.root.findByType(ScrollView).props;
const title=()=>tree.root.findByType(TextInput);
beforeEach(()=>{
  mockScroll.mockClear();close.mockClear();listeners={};frame=undefined;
  mockViewport.mockImplementation(cb=>cb(0,100,320,300));
  input={measureInWindow:jest.fn(cb=>cb(0,460,300,100))};focused=input;
  jest.spyOn(TextInput.State,'currentlyFocusedInput').mockImplementation(()=>focused as never);
  jest.spyOn(Keyboard,'metrics').mockReturnValue(undefined);
  jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
  const nativeAddListener=Keyboard.addListener.bind(Keyboard);
  jest.spyOn(Keyboard,'addListener').mockImplementation((name,callback)=>{
    listeners[name]=callback as typeof listeners[string];return nativeAddListener(name,()=>{});
  });
  jest.spyOn(global,'requestAnimationFrame').mockImplementation(cb=>{frame=()=>cb(0);return 1;});
  jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{frame=undefined;});
});
afterEach(()=>{act(()=>tree?.unmount());jest.restoreAllMocks();});
function mount(){act(()=>{tree=renderer.create(<CreateEventModal visible event={{...event,notes:null}} onClose={close} onCreated={()=>{}}/>);});}
function tick(){act(()=>{const f=frame;frame=undefined;f?.();});}
it('wires focused-input reveal into the real calendar form without changing its values',()=>{
  mount();const initial=title().props.value;
  expect(typeof scroll().onFocus).toBe('function');
  act(()=>scroll().onFocus({}));tick();
  expect(mockScroll).toHaveBeenCalledWith({y:172,animated:false});
  expect(title().props.value).toBe(initial);
  expect(scroll().automaticallyAdjustKeyboardInsets).toBe(false);
});
it('remeasures the available viewport on keyboard/layout changes without double-counting system bars',()=>{
  mount();input.measureInWindow.mockImplementation(cb=>cb(0,200,300,80));
  act(()=>scroll().onFocus({}));tick();expect(mockScroll).not.toHaveBeenCalled();
  mockViewport.mockImplementation(cb=>cb(0,100,320,150));
  act(()=>{listeners.keyboardDidShow({endCoordinates:{screenX:0,screenY:250,width:320,height:350}});scroll().onLayout({});});tick();
  expect(mockScroll).toHaveBeenCalledWith({y:42,animated:false});
});
it('ignores stale focus measurements and cancels work when the modal closes/reopens',()=>{
  let measured:((x:number,y:number,w:number,h:number)=>void)|undefined;
  mockViewport.mockImplementation(cb=>{measured=cb;});mount();
  act(()=>scroll().onFocus({}));tick();const old=measured;
  act(()=>scroll().onBlur({}));focused={measureInWindow:jest.fn()};
  old?.(0,100,320,300);expect(input.measureInWindow).not.toHaveBeenCalled();expect(mockScroll).not.toHaveBeenCalled();
  act(()=>scroll().onFocus({}));
  act(()=>tree.update(<CreateEventModal visible={false} event={event} onClose={close} onCreated={()=>{}}/>));tick();
  expect(mockScroll).not.toHaveBeenCalled();
  act(()=>tree.update(<CreateEventModal visible event={{...event,notes:null}} onClose={close} onCreated={()=>{}}/>));
  expect(title().props.value).toBe(event.title);
});
