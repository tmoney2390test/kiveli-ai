import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {OperationsDashboard} from '../../lib/operations';
import {styles} from '../../styles/opsStyles';
import {Panel,RecordLine,date} from './OperationsPrimitives';

export function RetentionPanel({retention}:{retention:NonNullable<OperationsDashboard['retention']>}){
  const [expanded,setExpanded]=useState(false);
  const total=retention.policies.filter(p=>p.key!=='orphan_objects').reduce((sum,p)=>sum+Number(p.totalProcessed),0);
  return <Panel title="Data retention" hint={retention.unavailable?'Retention status is unavailable. Check the backend deployment.':retention.attention?'Cleanup needs attention. Review failed or overdue policies.':'Scheduled cleanup preserves account content and financial records.'}>
    <Text style={styles.recordTitle}>{total.toLocaleString()} records removed or minimized</Text>
    <Text style={styles.recordMeta}>{retention.policies.filter(p=>p.enabled).length} enabled policies · {retention.holds??0} preservation holds · batch counts are not total backlog estimates</Text>
    <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(!expanded)} style={{paddingVertical:14}}>
      <Text style={styles.recordTitle}>{expanded?'Hide retention details':'View retention policies and reporting history'}</Text>
    </Pressable>
    {expanded?<View>{retention.policies.map(p=><RecordLine key={p.key} title={`${p.label} · ${p.enabled?'Enabled':'Paused'}`} body={p.note} meta={`${p.lastError?`Error ${p.lastError}`:`Last success ${p.lastSuccessAt?date(p.lastSuccessAt):'Not yet run'}`} · last batch ${p.lastProcessed} · total ${Number(p.totalProcessed).toLocaleString()}`}/>)}
      {retention.storage?.objects.map(r=><RecordLine key={r.status} title={`Private file audit · ${r.status}`} body={`${r.objects} files · ${(Number(r.bytes)/1_000_000).toFixed(2)} MB`} meta="Unreferenced files wait seven days and are checked again before removal. Deleted-file records cover the last 30 days."/>)}
      {retention.rollups.map(r=><RecordLine key={r.kind} title={`${r.kind} history`} body={`${Number(r.records).toLocaleString()} summarized events${r.kind==='ai_usage'?` · $${Number(r.cost_usd).toFixed(2)} provider cost`:''}`} meta={`${r.oldest} – ${r.newest} · retained for 13 months`}/>)}
    </View>:null}
  </Panel>;
}
