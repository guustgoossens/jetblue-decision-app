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


def _genie_ask(question: str, conversation_id, token):
    w = _genie_client(token)
    space = os.environ.get("GENIE_SPACE_ID") or GENIE_SPACE_ID_DEFAULT
    if conversation_id:
        msg = w.genie.create_message_and_wait(space, conversation_id, question)
    else:
        msg = w.genie.start_conversation_and_wait(space, question)
    conv_id = getattr(msg, "conversation_id", None) or conversation_id
    out = {"conversationId": conv_id, "messageId": msg.id or getattr(msg, "message_id", None),
           "text": "", "sql": None, "columns": [], "rows": []}
    texts = []
    for att in (msg.attachments or []):
        if att.text is not None and getattr(att.text, "content", None):
            texts.append(att.text.content)
        if att.query is not None:
            q = att.query
            if getattr(q, "description", None):
                texts.append(q.description)
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
    out["text"] = "\n\n".join(t for t in texts if t)
    return out


@app.post("/api/genie")
async def genie(request: Request):
    try:
        body = await request.json()
        question = str(body.get("question", "")).strip()
        conv = body.get("conversationId") or None
    except Exception:
        return JSONResponse({"error": "body must be JSON like {\"question\":\"...\"}"}, status_code=200)
    if not question:
        return JSONResponse({"error": "question is required"}, status_code=200)
    token = request.headers.get("x-forwarded-access-token")
    try:
        return await run_in_threadpool(_genie_ask, question, conv, token)
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
