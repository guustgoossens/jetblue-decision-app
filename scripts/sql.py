import json,subprocess,sys,time
def q(sql):
    body=json.dumps({"warehouse_id":"8096eced7bf8d567","statement":sql,"wait_timeout":"50s","format":"JSON_ARRAY","disposition":"INLINE"})
    r=json.loads(subprocess.run(["databricks","api","post","/api/2.0/sql/statements","-p","DEFAULT","--json",body],capture_output=True,text=True).stdout)
    while r.get("status",{}).get("state") in ("PENDING","RUNNING"):
        time.sleep(3); r=json.loads(subprocess.run(["databricks","api","get","/api/2.0/sql/statements/"+r["statement_id"],"-p","DEFAULT"],capture_output=True,text=True).stdout)
    if r["status"]["state"]!="SUCCEEDED": raise SystemExit(json.dumps(r["status"]))
    cols=[c["name"] for c in r["manifest"]["schema"]["columns"]]
    rows=r.get("result",{}).get("data_array",[]) or []
    # fetch extra chunks
    nxt=r.get("result",{}).get("next_chunk_internal_link")
    while nxt:
        c=json.loads(subprocess.run(["databricks","api","get",nxt,"-p","DEFAULT"],capture_output=True,text=True).stdout)
        rows+=c.get("data_array",[]) or []; nxt=c.get("next_chunk_internal_link")
    return cols,rows
if __name__=="__main__":
    c,r=q(sys.argv[1]); print(c); [print(x) for x in r[:int(sys.argv[2]) if len(sys.argv)>2 else 50]]; print(len(r),"rows")
