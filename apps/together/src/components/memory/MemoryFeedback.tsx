import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, Pin, Trash2, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { FrostedSurface } from '../FrostedGlass';
import { styles } from './memoryStyles';

export function MemoryBulkBar({count,busy,onCancel,onPin,onUnpin,onForget}:{count:number;busy:boolean;onCancel:()=>void;onPin:()=>void;onUnpin:()=>void;onForget:()=>void}){return <FrostedSurface intensity={92} style={styles.bulkBar}><Text style={styles.bulkCount}>{count} selected</Text><Pressable disabled={busy} onPress={onPin} style={styles.bulkAction}><Pin size={15} color={colors.rose}/><Text style={styles.bulkText}>Pin</Text></Pressable><Pressable disabled={busy} onPress={onUnpin} style={styles.bulkAction}><Pin size={15} color={colors.muted}/><Text style={styles.bulkText}>Unpin</Text></Pressable><Pressable disabled={busy} onPress={onForget} style={styles.bulkAction}><Trash2 size={15} color={colors.danger}/><Text style={[styles.bulkText,{color:colors.danger}]}>Forget</Text></Pressable><Pressable onPress={onCancel} style={styles.close}><X size={18} color={colors.muted}/></Pressable></FrostedSurface>;}
export function MemoryActionToast({message,onDismiss}:{message:string;onDismiss:()=>void}){useEffect(()=>{const timer=setTimeout(onDismiss,2600);return()=>clearTimeout(timer);},[onDismiss]);return <View pointerEvents="box-none" style={styles.toastPosition}><FrostedSurface intensity={92} style={styles.toast}><View style={styles.toastIcon}><Check size={14} strokeWidth={3} color="#fff"/></View><Text style={styles.toastText}>{message}</Text></FrostedSurface></View>;}
