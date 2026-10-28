#!/usr/bin/env python3
"""Finds each verse's nearest neighbors at full precision, skipping its own chapter, and writes
data/semantic/related.bin (RELATED_COUNT little-endian uint16 verse ids per verse).

Run by `npm run embeddings` after scripts/build-embeddings.js fills .cache/embeddings.f32. Python only
because a 42k x 42k similarity search is a few seconds of numpy and far too slow in plain JS."""

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DIMENSIONS = 384
RELATED_COUNT = 8
BLOCK_ROWS = 1024

data = json.loads((ROOT / "src/data/scriptures.json").read_text())
vectors = np.fromfile(ROOT / ".cache/embeddings.f32", dtype=np.float32).reshape(-1, DIMENSIONS)

# Each verse's global chapter number, so neighbors from the same chapter can be skipped.
chapter_of = np.concatenate([
    np.full(count, chapter_index, dtype=np.int32)
    for chapter_index, count in enumerate(
        count for work in data["works"] for book in work["books"] for count in book["chapters"]
    )
])
assert len(chapter_of) == len(vectors)

related = np.empty((len(vectors), RELATED_COUNT), dtype="<u2")
for start in range(0, len(vectors), BLOCK_ROWS):
    block = slice(start, start + BLOCK_ROWS)
    scores = vectors[block] @ vectors.T
    scores[chapter_of[block, None] == chapter_of[None, :]] = -np.inf
    top = np.argpartition(-scores, RELATED_COUNT, axis=1)[:, :RELATED_COUNT]
    order = np.argsort(-np.take_along_axis(scores, top, axis=1), axis=1)
    related[block] = np.take_along_axis(top, order, axis=1)

related.tofile(ROOT / "data/semantic/related.bin")
print(f"Wrote data/semantic/related.bin ({related.nbytes} B)")
