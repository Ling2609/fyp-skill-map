"""
Where a trained relationship model lives (7 Oct, run 6). A model folder is either
  - one model: the folder itself holds config.json (runs 1-5), or
  - a seed ensemble: sub-folders seed_<n>/, each a full model (run 6 on: the notebook saves every seed, and the
    app and evaluate_reference.py average the members' probabilities; Xu et al. 2020: voting over seeds improved
    BERT by about 5% on text classification and NLI, references.md "How to improve the relation model").
No other imports, so scripts can use it without loading the app's settings.
"""
import os


def members(path: str) -> list[str]:
    """The model folder(s) to load: [path] for one model, the seed_* sub-folders for an ensemble, [] if none."""
    if not path or not os.path.isdir(path):
        return []
    if os.path.isfile(os.path.join(path, "config.json")):
        return [path]
    subs = sorted(os.path.join(path, d) for d in os.listdir(path)
                  if d.startswith("seed_") and os.path.isfile(os.path.join(path, d, "config.json")))
    return subs
