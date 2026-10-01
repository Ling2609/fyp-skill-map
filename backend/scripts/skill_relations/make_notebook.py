"""Builds train_relation_model.ipynb (kept as code here so the notebook stays reviewable in git diffs).
Usage (from backend/): python scripts/skill_relations/make_notebook.py"""
import nbformat as nbf

cells = []
md = lambda t: cells.append(nbf.v4.new_markdown_cell(t))
code = lambda t: cells.append(nbf.v4.new_code_cell(t))

md("""# SkillMap Stage 2: skill relationship model

Trains a cross-encoder that reads two skill names (A = the student's skill, B = the job's skill) and predicts
**SATISFIES** (SAME + NARROWER), **RELATED** or **NOT** (BROADER + DIFFERENT), following `docs/skill_relation_label_guide.md`.

Run on Google Colab: *Runtime → Change runtime type → T4 GPU*, then *Runtime → Run all*. Upload the pairs CSV when asked.
Each seed trains for a few minutes on a T4.""")

code("""# 1. Setup
!pip -q install transformers scikit-learn pandas
import os, json, random, time
import numpy as np, pandas as pd, torch
from torch import nn
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
from sklearn.metrics import f1_score, classification_report, confusion_matrix

MODEL_NAME = os.environ.get("MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")  # the app's SBERT model
PAIRS_CSV = os.environ.get("PAIRS_CSV", "pairs_esco_onet_v1.csv")
SEEDS = [int(s) for s in os.environ.get("SEEDS", "13,42,77").split(",")]
EPOCHS, LR, BATCH, MAX_LEN = int(os.environ.get("EPOCHS", 4)), 2e-5, 32, 64
LABELS = ["SATISFIES", "RELATED", "NOT"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print("device:", DEVICE, "| model:", MODEL_NAME)""")

code("""# 2. Data (upload the CSV in Colab if it isn't there yet)
if not os.path.exists(PAIRS_CSV):
    from google.colab import files
    PAIRS_CSV = list(files.upload().keys())[0]
df = pd.read_csv(PAIRS_CSV)
df["y"] = df.label3.map({l: i for i, l in enumerate(LABELS)})
train, val, test = (df[df.split == s].reset_index(drop=True) for s in ("train", "val", "test"))
print(pd.crosstab(df.label5, df.split, margins=True))""")

code("""# 3. Baseline: what the app does today (SBERT cosine, 0.7 = has the skill, 0.6-0.7 = related)
tok = AutoTokenizer.from_pretrained(MODEL_NAME)
enc = AutoModel.from_pretrained(MODEL_NAME).to(DEVICE).eval()

@torch.no_grad()
def embed(texts, bs=128):
    out = []
    for i in range(0, len(texts), bs):
        b = tok(texts[i:i + bs], padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(DEVICE)
        h = enc(**b).last_hidden_state
        m = b["attention_mask"].unsqueeze(-1).float()
        v = (h * m).sum(1) / m.sum(1)                      # mean pooling, as sentence-transformers does
        out.append(torch.nn.functional.normalize(v, dim=-1).cpu())
    return torch.cat(out).numpy()

def cosine_predict(frame, hi=0.7, lo=0.6):
    sims = (embed(frame.a.tolist()) * embed(frame.b.tolist())).sum(1)
    return np.where(sims >= hi, 0, np.where(sims >= lo, 1, 2)), sims

base_pred, base_sims = cosine_predict(test)
baseline = {"macro_f1": f1_score(test.y, base_pred, average="macro")}
print("Baseline (cosine 0.7 / 0.6) macro-F1 on test:", round(baseline["macro_f1"], 3))
print(classification_report(test.y, base_pred, target_names=LABELS, zero_division=0))
del enc""")

code("""# 4. Train the cross-encoder (3 seeds)
def batches(frame, shuffle, seed=0):
    idx = list(range(len(frame)))
    if shuffle:
        random.Random(seed).shuffle(idx)
    for i in range(0, len(idx), BATCH):
        part = frame.iloc[idx[i:i + BATCH]]
        b = tok(part.a.tolist(), part.b.tolist(), padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")
        yield {k: v.to(DEVICE) for k, v in b.items()}, torch.tensor(part.y.values, device=DEVICE)

@torch.no_grad()
def predict(model, frame):
    model.eval()
    preds = []
    for b, _ in batches(frame, False):
        preds.append(model(**b).logits.argmax(-1).cpu())
    return torch.cat(preds).numpy() if preds else np.array([])

counts = np.bincount(train.y, minlength=3)
weights = torch.tensor(len(train) / (3 * np.maximum(counts, 1)), dtype=torch.float, device=DEVICE)  # class weights
runs = []
for seed in SEEDS:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=3).to(DEVICE)
    opt = torch.optim.AdamW(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss(weight=weights)
    best, best_state, t0 = -1, None, time.time()
    for epoch in range(EPOCHS):
        model.train()
        for b, y in batches(train, True, seed + epoch):
            loss = loss_fn(model(**b).logits, y)
            loss.backward(); opt.step(); opt.zero_grad()
        f1 = f1_score(val.y, predict(model, val), average="macro")
        print(f"seed {seed} epoch {epoch + 1}: val macro-F1 {f1:.3f}")
        if f1 > best:
            best, best_state = f1, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    pred = predict(model, test)
    runs.append({"seed": seed, "val_f1": best, "test_f1": f1_score(test.y, pred, average="macro"),
                 "pred": pred.tolist(), "minutes": round((time.time() - t0) / 60, 1)})
    if seed == SEEDS[0]:
        model.save_pretrained("relation_model"); tok.save_pretrained("relation_model")
    print(f"seed {seed}: test macro-F1 {runs[-1]['test_f1']:.3f} ({runs[-1]['minutes']} min)")""")

code("""# 5. Results
f1s = [r["test_f1"] for r in runs]
print(f"Cross-encoder test macro-F1: {np.mean(f1s):.3f} ± {np.std(f1s):.3f} over {len(f1s)} seeds")
print(f"Baseline (cosine) test macro-F1: {baseline['macro_f1']:.3f}")
pred = np.array(runs[0]["pred"])
print(classification_report(test.y, pred, target_names=LABELS, zero_division=0))
print("Confusion matrix (rows = true, cols = predicted):", LABELS)
print(confusion_matrix(test.y, pred, labels=[0, 1, 2]))

# Direction test: NARROWER must come out SATISFIES and the same pair reversed (BROADER) must not
d = test[test.label5.isin(["NARROWER", "BROADER"])]
ok = ((d.label5 == "NARROWER") & (pred[d.index] == 0)) | ((d.label5 == "BROADER") & (pred[d.index] != 0))
cos_ok = ((d.label5 == "NARROWER") & (base_pred[d.index] == 0)) | ((d.label5 == "BROADER") & (base_pred[d.index] != 0))
print(f"Direction test ({len(d)} pairs): model {ok.mean():.3f}, cosine {cos_ok.mean():.3f} "
      "(cosine gives A->B and B->A the same score, so it can't exceed 0.5 on balanced pairs)")

json.dump({"pairs_csv": PAIRS_CSV, "model": MODEL_NAME, "seeds": SEEDS, "epochs": EPOCHS,
           "baseline_macro_f1": baseline["macro_f1"], "test_macro_f1": f1s,
           "direction_model": float(ok.mean()), "direction_cosine": float(cos_ok.mean()),
           "runs": [{k: v for k, v in r.items() if k != "pred"} for r in runs]},
          open("results.json", "w"), indent=1)
print("Saved results.json and relation_model/ (first seed)")""")

code("""# 6. Download the results (Colab)
try:
    from google.colab import files
    !zip -qr relation_model.zip relation_model results.json
    files.download("relation_model.zip")
except ImportError:
    print("Not on Colab: results.json and relation_model/ are in the current folder")""")

nb = nbf.v4.new_notebook()
nb["cells"] = cells
nb["metadata"] = {"accelerator": "GPU", "kernelspec": {"name": "python3", "display_name": "Python 3"}}
nbf.write(nb, "scripts/skill_relations/train_relation_model.ipynb")
print("wrote scripts/skill_relations/train_relation_model.ipynb")
