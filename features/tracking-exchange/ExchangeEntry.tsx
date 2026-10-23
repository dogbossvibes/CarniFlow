import { Ionicons } from '@expo/vector-icons';
import { Pressable,Text,View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import '@/features/tracking-sharing/i18n';
export function ExchangeEntry({sourceId}:{sourceId?:string}){
 const router=useRouter(),{t}=useTranslation('trackSharing');
 return <Pressable accessibilityRole="button" style={{minHeight:64,padding:16,gap:12,flexDirection:'row',alignItems:'center',borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:C.card}} onPress={()=>router.push({pathname:'/track/sharing',params:sourceId?{sourceId}:{}} as never)}><Ionicons name="share-outline" size={24} color={C.accent}/><View style={{flex:1,gap:5}}><Text style={{color:C.accent,fontSize:17,fontWeight:'700'}}>{sourceId ? 'Fährte weitergeben' : t('entryTitle')}</Text><Text style={{color:C.trackTextSec,fontSize:14,lineHeight:21}}>{t('subtitle')}</Text></View><Ionicons name="chevron-forward" size={18} color={C.accent}/></Pressable>;
}
