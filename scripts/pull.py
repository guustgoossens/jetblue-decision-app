import json,sys,os
sys.path.insert(0,os.path.dirname(__file__)); from sql import q
OUT=os.path.join(os.path.dirname(__file__),'..','data_raw')
T='xhec26.jetblue_d2_team_12'; R='xhec26.lab2026_daily_v2_jetblue_d2'
jobs={'validation_scored':f'select * from {T}.validation_scored','blind_scored':f'select * from {T}.blind_scored',
 'quarantine':f'select * from {T}.quarantine','quality_findings':f'select * from {T}.quality_findings',
 'model_comparison':f'select * from {T}.model_comparison','snapshot_audit':f'select * from {T}.snapshot_audit',
 'clean_features':f'select * from {T}.clean_features','expected_records':f'select * from {R}.expected_records',
 'observations_raw':f'select available_at,decimal_format,entity_id,observed_at,revision,segment,source_batch,x1,x2,x2_unit,x3 from {R}.observations_raw',
 'policy_history':f'select * from {R}.policy_history','recovery_log':f'select * from {R}.recovery_log',
 'training_labels':f"select l.* from {R}.training_labels l join {R}.expected_records e using(record_id) where e.split='train'"}
from concurrent.futures import ThreadPoolExecutor
def run(k):
    c,r=q(jobs[k]); json.dump({'cols':c,'rows':r},open(f'{OUT}/{k}.json','w')); return k,len(r)
with ThreadPoolExecutor(6) as ex:
    for k,n in ex.map(run,jobs): print(k,n)
