import type{ReactNode}from'react';
import{Pressable,StyleSheet,Text,View}from'react-native';
import{BedDouble,Leaf,Martini,Ticket,UtensilsCrossed}from'lucide-react-native';
import{type ExploreCategoryId}from'../lib/explore';
import{colors,radius}from'../theme';

const icons:Record<ExploreCategoryId,ReactNode>={
  food:<UtensilsCrossed size={18} color="#F3C989"/>,
  nightlife:<Martini size={18} color="#F2A4C6"/>,
  lodging:<BedDouble size={18} color="#EFC28C"/>,
  quiet:<Leaf size={18} color="#A9C88D"/>,
  entertainment:<Ticket size={18} color="#A9B9F2"/>,
};

export function PlaceCategoryFilters({categories,value,onChange}:{categories:Array<{id:ExploreCategoryId;label:string;count?:number}>;value:ExploreCategoryId|null;onChange:(value:ExploreCategoryId|null)=>void}){
  return <View accessibilityRole="tablist" style={styles.row}>{categories.map((item)=>{
    const selected=value===item.id;
    return <Pressable accessibilityRole="tab" accessibilityLabel={`${item.label}${typeof item.count==='number'?`, ${item.count} places`:''}`} accessibilityState={{selected}} key={item.id} onPress={()=>onChange(selected?null:item.id)} style={[styles.card,selected&&styles.cardActive]}>
      <View style={[styles.icon,selected&&styles.iconActive]}>{icons[item.id]}</View>
      <Text numberOfLines={2} style={[styles.label,selected&&styles.labelActive]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}

const styles=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'stretch',justifyContent:'center',gap:7,width:'100%'},
  card:{flexGrow:1,flexBasis:58,maxWidth:124,minWidth:58,minHeight:76,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:3,paddingVertical:8,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.025)'},
  cardActive:{borderColor:'#F1C67C',backgroundColor:'rgba(240,198,125,.10)'},
  icon:{width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.045)'},
  iconActive:{backgroundColor:'rgba(240,198,125,.12)'},
  label:{color:colors.muted,fontSize:8.5,lineHeight:11,fontWeight:'800',textAlign:'center'},
  labelActive:{color:'#FFE2B2'},
});
