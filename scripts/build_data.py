"""Build web/src/data/bundle.json for the JetBlue Day 2 app from data_raw/ (pulled by scripts/pull.py).

Sources: team schema xhec26.jetblue_d2_team_12 (scored tables, quarantine, findings, model comparison)
and the raw Day 2 tables (resolved_outcome_hint never pulled; training labels = train split only).
The champion LogisticRegression is refit on the train split and asserted equal (1e-9) to the logged
validation and blind risks, so the browser formula is the logged model.
"""
import json, math, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, roc_auc_score
warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data_raw"; OUT = ROOT / "web/src/data/bundle.json"
L = lambda k: (lambda d: pd.DataFrame(d["rows"], columns=d["cols"]))(json.load(open(RAW / f"{k}.json")))
V, B, Q, QF, MC, SA, CF, E, O, POL, REC, TL = (L(k) for k in [
    "validation_scored", "blind_scored", "quarantine", "quality_findings", "model_comparison", "snapshot_audit",
    "clean_features", "expected_records", "observations_raw", "policy_history", "recovery_log", "training_labels"])
F = ["x1", "x2", "x3"]
for df in (CF,): df[F] = df[F].astype(float)
V = V.rename(columns={"queue_depth": "x1", "weather_severity": "x2", "turnaround_buffer_minutes": "x3"})
B = B.rename(columns={"queue_depth": "x1", "weather_severity": "x2", "turnaround_buffer_minutes": "x3"})
for df in (V, B): df[F + ["risk"]] = df[F + ["risk"]].astype(float)
V["y"] = V.label.astype(float).astype(int)
assert len(CF) == 1707 and len(Q) == 293 and len(V) == 342 and len(B) == 342
assert "label" not in B.columns

train = CF[CF.split == "train"].merge(TL, on="record_id", validate="one_to_one")
train["y"] = train.label.astype(int); assert len(train) == 1023
Xtr, ytr = train[F], train.y

# ---- champion: refit == logged ----------------------------------------------
lr = make_pipeline(StandardScaler(), LogisticRegression()).fit(Xtr, ytr)
assert np.allclose(lr.predict_proba(V[F])[:, 1], V.risk, atol=1e-9)
assert np.allclose(lr.predict_proba(B[F])[:, 1], B.risk, atol=1e-9)
sc, m = lr.steps[0][1], lr.steps[1][1]
champion = dict(algorithm="LogisticRegression", intercept=float(m.intercept_[0]), coef=[float(c) for c in m.coef_[0]],
                mean=[float(c) for c in sc.mean_], scale=[float(c) for c in sc.scale_])

# ---- other candidates: refit, check against the logged comparison ------------
logged = {r.algorithm: r for r in MC.itertuples()}
cands = {"dummy": DummyClassifier(strategy="prior"), "rf": RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=123),
         "hgb": HistGradientBoostingClassifier(max_depth=3, random_state=42)}
V["lr"] = V.risk
for k, est in cands.items():
    V[k] = est.fit(Xtr, ytr).predict_proba(V[F])[:, 1]
KEY = {"DummyClassifier": "dummy", "LogisticRegression": "lr", "RandomForestClassifier": "rf", "HistGradientBoostingClassifier": "hgb"}
LABEL = {"dummy": "Dummy baseline", "lr": "Logistic Regression", "rf": "Random Forest", "hgb": "Gradient Boosting"}
models, mismatch = [], []
for alg, r in logged.items():
    k = KEY[alg]; yhat = (V[k] >= 0.5).astype(int)
    acc, bal = accuracy_score(V.y, yhat), balanced_accuracy_score(V.y, yhat)
    if not math.isclose(bal, float(r.validation_balanced_accuracy), abs_tol=1e-9): mismatch.append((k, bal, r.validation_balanced_accuracy))
    auc = float(roc_auc_score(V.y, V[k])) if V[k].nunique() > 1 else 0.5
    models.append(dict(key=k, label=LABEL[k], algorithm=alg, runId=r.run_id, modelId=r.model_id,
                       accuracy=float(r.validation_accuracy), balancedAccuracy=float(r.validation_balanced_accuracy),
                       auc=auc, isChampion=str(r.is_champion).lower() == "true"))
assert not mismatch, mismatch
order = {"lr": 0, "rf": 1, "hgb": 2, "dummy": 3}; models.sort(key=lambda d: order[d["key"]])

# ---- funnel ------------------------------------------------------------------
REASONS = {
    "policy_not_allowed": ("Not permitted", "The latest model_training policy effective by decision time does not allow use (revoked, or only granted later)."),
    "x1_unparseable": ("Unparseable value", "Queue depth arrives as the literal 'unparseable'; the contract permits no repair."),
    "no_observation_at_decision_time": ("No timely observation", "No observation for this flight-hour was available by the decision time."),
}
assert set(Q.reason) == set(REASONS), set(Q.reason)
by_split = {}
for s in ["train", "validation", "blind"]:
    ex = E[E.split == s]; rj = Q[Q.split == s]
    by_split[s] = dict(expected=len(ex), eligible=int(len(ex) - len(rj)), quarantined=len(rj),
                       reasons=rj.reason.value_counts().to_dict(), start=ex.observed_at.min(), end=ex.observed_at.max())

# ---- naive vs repaired, measured on raw -------------------------------------
norm = lambda s: s.str.strip().str.lower().str.replace(r"-legacy$", "", regex=True)
O["key"] = norm(O.segment) + ":" + O.entity_id
POL["key"] = norm(POL.segment) + ":" + POL.entity_id
REC["key"] = REC.record_id.str.split(":").str[0].pipe(norm) + ":" + REC.record_id.str.split(":").str[1]
O["rawkey"] = O.segment + ":" + O.entity_id
Em = E.set_index("record_id")
lost_raw = int((~E.record_id.isin(set(O.rawkey))).sum())
O2 = O.merge(E[["record_id", "observed_at"]].rename(columns={"record_id": "key", "observed_at": "decision_at"}), on="key", how="left")
late = O2[O2.available_at > O2.decision_at]
nonnative = O.x2_unit.value_counts().to_dict()
naive = dict(rawRows=len(O), keyVariants=int(O.segment.nunique()), nonNormalRows=int((O.segment != norm(O.segment)).sum()),
             lostOnRawJoin=lost_raw, lateRows=int(len(late)), lateRecords=int(late.key.nunique()),
             lateMedianHours=float(((pd.to_datetime(late.available_at) - pd.to_datetime(late.decision_at)).dt.total_seconds() / 3600).median()),
             unitRows={k: int(v) for k, v in nonnative.items()}, commaRows=int((O.decimal_format == "comma").sum()),
             sentinelRows=int((pd.to_numeric(O.x3, errors="coerce") == -999).sum()), nullX1Rows=int(O.x1.isna().sum()),
             unparseableRows=int((O.x1 == "unparseable").sum()), replayRows=int((O.source_batch == "replay").sum()),
             genieNaiveLate=87, policyRows=len(POL), marketingRows=int((POL.purpose == "marketing").sum()),
             recoveryRows=len(REC), leakageAgreement="1,556 / 1,556")
print("naive", naive)

# ---- lineage -----------------------------------------------------------------
OBS = ["segment", "entity_id", "observed_at", "available_at", "revision", "source_batch", "decimal_format", "x1", "x2", "x2_unit", "x3"]
recs = lambda df, cols: json.loads(df[cols].to_json(orient="records"))
cleanmap = CF.set_index("record_id")
def lineage(rid, split, reason, detail):
    e = Em.loc[rid]
    out = dict(id=rid, split=split, reason=reason, detail=detail, observedAt=e.observed_at,
               observations=recs(O[O.key == rid].sort_values(["available_at", "revision"]), OBS),
               policies=recs(POL[POL.key == rid].sort_values("effective_at"), ["purpose", "allowed", "revision", "effective_at"]),
               recovery=recs(REC[REC.key == rid].sort_values("available_at"), ["field", "value", "available_at"]))
    out["output"] = {f: float(cleanmap.loc[rid, f]) for f in F} if rid in cleanmap.index else None
    return out
rejected = [lineage(r.record_id, r.split, r.reason, REASONS[r.reason][1]) for r in Q.sort_values("record_id").itertuples()]
clean_train = set(CF[CF.split != "blind"].record_id)
picks = []
def add(keys, tag, n):
    for k in sorted(set(keys) & clean_train)[:n]:
        if k not in [p[0] for p in picks]: picks.append((k, tag))
add(late.key, "Late revision ignored (arrived after decision time)", 8)
add(O[O.source_batch == "replay"].key, "Replay collapsed to one row", 6)
add(O[O.x2_unit == "percent"].key, "Weather in percent, divided by 100", 5)
add(O[O.x2_unit.str.contains("basis", na=False) | (O.x2_unit == "bps")].key, "Weather in basis points, divided by 10,000", 5)
add(O[O.decimal_format == "comma"].key, "Comma decimal parsed", 5)
add(REC[REC.field == "x1"].key, "Missing queue depth recovered from recovery_log", 5)
add(REC[REC.field == "x3"].key, "-999 buffer recovered from recovery_log", 5)
add(O[O.segment != norm(O.segment)].key, "Legacy key alias normalised", 5)
repaired = [lineage(k, Em.loc[k].split, "repaired", tag) for k, tag in picks]

stats = {}
for f in F:
    v = train[f]; hist, edges = np.histogram(v, bins=24)
    stats[f] = dict(min=float(v.min()), max=float(v.max()), median=float(v.median()), mean=float(v.mean()),
                    p25=float(v.quantile(.25)), p75=float(v.quantile(.75)), hist=[int(h) for h in hist], edges=[float(e) for e in edges])

features = [dict(key="x1", name="x1", label="Queue depth", unit="flights"),
            dict(key="x2", name="x2", label="Weather severity", unit="0–1"),
            dict(key="x3", name="x3", label="Turnaround buffer", unit="min")]
seg = lambda s: s.strip().lower()
bundle = dict(
    meta=dict(team="Databricked", teamId="team_12", case="JetBlue", day=2,
              decision="Prioritise operational interventions before disruption", target="disruption_next_hour",
              features=features, datasetId="lab2026_daily_v2_jetblue_d2", runId=next(m["runId"] for m in models if m["isChampion"]),
              experimentId="", genieUrl="", tables=dict(expected_records=len(E), observations_raw=len(O), policy_history=len(POL),
              recovery_log=len(REC), training_labels=1600), schema="xhec26.jetblue_d2_team_12",
              genieSpaceId="01f1dceb676310d4b026a8fcbc2c9922"),
    champion=champion, models=models, featureStats=stats,
    positiveRate=dict(train=float(ytr.mean()), validation=float(V.y.mean())),
    validation=[dict(id=r.record_id, segment=seg(r.segment), observedAt=r.observed_at, y=int(r.y), x1=r.x1, x2=r.x2, x3=r.x3,
                     lr=float(r.lr), rf=float(r.rf), hgb=float(r.hgb), dummy=float(r.dummy)) for r in V.itertuples()],
    queue=[dict(id=r.record_id, segment=seg(r.segment), observedAt=r.observed_at, x1=r.x1, x2=r.x2, x3=r.x3, risk=r.risk)
           for r in B.sort_values("risk", ascending=False).itertuples()],
    funnel=dict(expected=len(E), eligible=len(CF), quarantined=len(Q), bySplit=by_split,
                reasons=[dict(key=k, label=v[0], explanation=v[1], count=int((Q.reason == k).sum())) for k, v in REASONS.items()]),
    naive=naive, findings=json.loads(QF.to_json(orient="records")),
    genieFindings="Vanilla Genie on the raw tables said 87 raw rows arrive after the decision time, because it joined on raw keys. After key normalisation the correct figure is 216.",
    lineage=dict(rejected=rejected, repaired=repaired),
    business=dict(latencyNowMin=10, latencyNeededMin=1, delaysPerWeek=14, targetReduction=0.5, decisionWindowMin=30),
)
text = json.dumps(bundle, separators=(",", ":"), allow_nan=False)
for banned in ["32c86f31", "@hec.edu"]:
    assert banned not in text, banned
OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(text)
print("OK bytes", len(text), [(m["key"], round(m["balancedAccuracy"], 4), round(m["auc"], 4)) for m in models])
print("repaired picks", len(repaired), "rejected", len(rejected), "rates", bundle["positiveRate"])
