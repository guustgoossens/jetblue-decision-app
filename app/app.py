"""Databricks App host: serves the prebuilt React build and a tiny scoring API."""
import math
import os
from pathlib import Path

import joblib
import pandas as pd
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
RUN_ID = "3a67645b80454b79a1ea5429696990ea"
GENIE_SPACE_ID_DEFAULT = "01f1dceb676310d4b026a8fcbc2c9922"
GENIE_MAX_ROWS = 200
COLS = ["x1", "x2", "x3"]
MAX_ROWS = 500

MODEL = joblib.load(ROOT / "model.joblib")  # loaded once at startup
MODEL_NAME = type(MODEL.steps[-1][1]).__name__ if hasattr(MODEL, "steps") else type(MODEL).__name__

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def bad(msg: str) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=400)


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "run_id": RUN_ID}


@app.post("/api/score")
async def score(request: Request):
    try:
        body = await request.json()
        rows = body["rows"]
    except Exception:
        return bad("body must be JSON like {\"rows\":[{\"x1\":0,\"x2\":0,\"x3\":0}]}")
    if not isinstance(rows, list) or not rows:
        return bad("rows must be a non-empty list")
    if len(rows) > MAX_ROWS:
        return bad(f"at most {MAX_ROWS} rows")
    data = []
    for r in rows:
        if not isinstance(r, dict):
            return bad("each row must be an object")
        vals = []
        for c in COLS:
            v = r.get(c)
            try:
                ok = not isinstance(v, bool) and isinstance(v, (int, float)) and math.isfinite(float(v))
                fv = float(v) if ok else 0.0
            except OverflowError:
                ok = False
            if not ok:
                return bad(f"{c} must be a finite number")
            vals.append(fv)
        data.append(vals)
    p = MODEL.predict_proba(pd.DataFrame(data, columns=COLS))[:, 1]
    return {"p": [float(x) for x in p]}


def _genie_client(token):
    from databricks.sdk import WorkspaceClient
    if token:
        from databricks.sdk.core import Config
        return WorkspaceClient(host=Config().host, token=token, auth_type="pat")
    return WorkspaceClient()


# We cannot edit the shared Genie space's instructions (owner-only), so the app grounds every
# question itself: a glossary of the pilot tables, the app's own "now", and the tenant's role.
GLOSSARY = (
    "Data: schema xhec26.jetblue_d2_team_12, synthetic flight-disruption pilot. "
    "blind_scored(record_id, segment = region north/south/east/west, observed_at, queue_depth, weather_severity 0-1, "
    "turnaround_buffer_minutes, risk = predicted probability of disruption in the next hour) holds the 342 upcoming flight-hours. "
    "validation_scored has the same columns plus label (1 = disrupted). quarantine(record_id, split, reason) holds the 293 "
    "rejected records; quality_findings(issue, test, resolution) the 9 data checks; clean_features(record_id, x1 queue, "
    "x2 weather, x3 buffer, split) the 1,707 usable records; model_comparison the MLflow runs (champion LogisticRegression). "
    "The app's current time is 2026-09-03 08:49 UTC, so 'now' or 'next 30 minutes' means observed_at between 08:49 and 09:19 UTC "
    "on 2026-09-03; the ops desk flags risk >= 0.5. Money is a scenario: expected disruption cost = risk * 5000 USD, "
    "value of acting = risk * 0.3 * 5000 - 500 USD; say these are assumptions. "
)
ROLE = {
    "ops": "The user is the duty manager: answer about specific upcoming flight-hours, regions and what to act on first. ",
    "cio": "The user is the CIO: answer in money, totals and trade-offs, and keep it to a few sentences. ",
    "data": "The user is the VP of Data: answer about data quality, quarantine reasons, repairs and model evidence. ",
}
STYLE = ("Always answer with a SQL query on these tables, then two or three plain sentences with the key numbers. "
         "Never refuse a business question: translate it into these tables. Question: ")
REFUSAL = ("can't", "cannot", "not able", "unable", "no data", "don't have", "do not have", "not available", "outside")


def _scoped(question: str, first: bool, tenant) -> str:
    role = ROLE.get(tenant or "", "")
    return (GLOSSARY + role + STYLE if first else role + STYLE) + question


def _send(w, space, conversation_id, text):
    if conversation_id:
        return w.genie.create_message_and_wait(space, conversation_id, text)
    return w.genie.start_conversation_and_wait(space, text)


def _genie_ask(question: str, conversation_id, token, tenant=None):
    w = _genie_client(token)
    space = os.environ.get("GENIE_SPACE_ID") or GENIE_SPACE_ID_DEFAULT
    msg = _send(w, space, conversation_id, _scoped(question, not conversation_id, tenant))
    conv_id = getattr(msg, "conversation_id", None) or conversation_id
    # One nudge when Genie answers without querying the data (usually a refusal).
    if not any(a.query is not None for a in (msg.attachments or [])):
        said = " ".join((a.text.content or "") for a in (msg.attachments or []) if a.text is not None).lower()
        if not said or any(r in said for r in REFUSAL):
            msg = _send(w, space, conv_id, GLOSSARY + STYLE + question)
    out = {"conversationId": conv_id, "messageId": msg.id or getattr(msg, "message_id", None),
           "text": "", "sql": None, "columns": [], "rows": []}
    texts, desc = [], None
    for att in (msg.attachments or []):
        if att.text is not None and getattr(att.text, "content", None):
            texts.append(att.text.content)
        if att.query is not None:
            q = att.query
            desc = getattr(q, "description", None)
            out["sql"] = getattr(q, "query", None)
            try:
                res = w.genie.get_message_attachment_query_result(
                    space, conv_id, out["messageId"], att.attachment_id)
                sr = res.statement_response
                if sr is not None:
                    cols = []
                    if sr.manifest and sr.manifest.schema and sr.manifest.schema.columns:
                        cols = [c.name for c in sr.manifest.schema.columns]
                    rows = (sr.result.data_array if sr.result and sr.result.data_array else [])
                    out["columns"] = cols
                    out["rows"] = [list(r) for r in rows[:GENIE_MAX_ROWS]]
            except Exception as e:  # keep the text answer even if the table fails
                out["error"] = f"Result table unavailable: {e}"
    # Genie's query description restates the question ("You want to see ..."): only use it if nothing else was said.
    if not texts and desc:
        texts.append(desc)
    out["text"] = "\n\n".join(_tidy(t) for t in texts if t)
    return out


def _tidy(t: str) -> str:
    import re
    t = re.sub(r"^(You want to|You asked|You are asking|You'd like to)[^.]*\.\s*", "", t.strip())
    return t[:1].upper() + t[1:] if t else t


@app.post("/api/genie")
async def genie(request: Request):
    try:
        body = await request.json()
        question = str(body.get("question", "")).strip()
        conv = body.get("conversationId") or None
        tenant = body.get("tenant") if body.get("tenant") in ("ops", "cio", "data") else None
    except Exception:
        return JSONResponse({"error": "body must be JSON like {\"question\":\"...\"}"}, status_code=200)
    if not question:
        return JSONResponse({"error": "question is required"}, status_code=200)
    token = request.headers.get("x-forwarded-access-token")
    try:
        return await run_in_threadpool(_genie_ask, question, conv, token, tenant)
    except Exception as e:
        return JSONResponse({"conversationId": conv, "messageId": None, "text": "", "sql": None,
                             "columns": [], "rows": [], "error": f"{type(e).__name__}: {e}"})


@app.get("/{path:path}")
def spa(path: str):
    if path == "api" or path.startswith("api/"):
        return JSONResponse({"error": "not found"}, status_code=404)
    index = STATIC / "index.html"
    if path:
        f = (STATIC / path).resolve()
        if f.is_file() and STATIC.resolve() in f.parents:
            headers = {}
            if path.startswith("assets/"):  # hashed build assets
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return FileResponse(f, headers=headers)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("DATABRICKS_APP_PORT", "8000")),
                access_log=False)
