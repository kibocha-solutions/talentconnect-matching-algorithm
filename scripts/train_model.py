#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.ranking.trainer import XGBoostRankingTrainer, build_training_examples

DEFAULT_TRAINING_ROWS_PATH = PROJECT_ROOT / "data" / "samples" / "training_rows.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train the first-pass TalentConnect ranking model.",
    )
    parser.add_argument(
        "--training-rows",
        type=Path,
        default=DEFAULT_TRAINING_ROWS_PATH,
        help="Path to the labeled training rows JSON file.",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=None,
        help="Optional directory override for saved model artifacts.",
    )
    parser.add_argument(
        "--num-boost-round",
        type=int,
        default=48,
        help="Number of XGBoost boosting rounds to run.",
    )
    return parser.parse_args()


def load_training_rows(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        raise FileNotFoundError(f"Training rows file not found: {path}")

    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise ValueError("Training rows JSON must be a non-empty list.")
    return rows


def main() -> int:
    try:
        args = parse_args()
        training_rows = load_training_rows(args.training_rows.resolve())
        trainer = XGBoostRankingTrainer(
            model_dir=args.model_dir.resolve() if args.model_dir else None,
            num_boost_round=args.num_boost_round,
        )
        examples = build_training_examples(training_rows)
        trained_model = trainer.fit_and_save(examples)

        print("Training completed")
        print(f"rows: {trained_model.training_summary.row_count}")
        print(f"features: {trained_model.training_summary.feature_count}")
        print(f"training rmse: {trained_model.training_summary.training_rmse:.4f}")
        print(f"model path: {trained_model.model_path}")
        print(f"metadata path: {trained_model.metadata_path}")
        return 0
    except Exception as exc:
        print(f"Training failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
