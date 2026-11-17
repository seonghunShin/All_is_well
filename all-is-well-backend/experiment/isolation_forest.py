"""Fit and evaluate Isolation Forest on local booking events."""

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import argparse
import csv
import json
import math
from pathlib import Path
import random
from statistics import median


ACTIONS = {
    "QUEUE_JOIN",
    "QUEUE_STATUS",
    "SEAT_HOLD",
    "SEAT_RELEASE",
    "HOLD_EXPIRED",
    "BOOKING_CONFIRM",
}
RULE_FLAGS = {"RATE_LIMITED", "BOOKING_LIMIT", "NOT_ADMITTED"}
FEATURE_NAMES = (
    "request_count",
    "largest_five_second_request_burst",
    "median_request_interval_seconds",
    "queue_status_count",
    "hold_attempt_count",
    "seat_unavailable_count",
    "hold_exists_count",
    "hold_release_count",
    "hold_expiration_count",
    "confirm_attempt_count",
    "policy_rejection_count",
)


@dataclass(frozen=True)
class Event:
    session_id: str
    action: str
    outcome: str
    timestamp: datetime


@dataclass(frozen=True)
class Observation:
    session_id: str
    features: tuple
    rule_flag: bool


def read_events(path):
    events = []
    with path.open(encoding="utf-8-sig") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                session_id = data["sessionId"]
                action = data["action"]
                outcome = data["outcome"]
                timestamp = datetime.fromisoformat(data["timestamp"])
                if timestamp.utcoffset() is None:
                    raise ValueError("timestamp에 시간대가 필요합니다")
                if not all(
                    isinstance(value, str) and value.strip()
                    for value in (session_id, action, outcome)
                ):
                    raise ValueError("sessionId, action, outcome은 문자열이어야 합니다")
                events.append(Event(session_id, action, outcome, timestamp))
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(f"{path}:{line_number} {error}") from error
    return events


def read_labels(path):
    labels = {}
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"sessionId", "label"}.issubset(reader.fieldnames or []):
            raise ValueError("평가 라벨 CSV에 sessionId,label 열이 필요합니다")
        for line_number, row in enumerate(reader, 2):
            session_id = row.get("sessionId")
            label = row.get("label")
            if (
                not session_id
                or session_id in labels
                or label not in {"normal", "abuse"}
            ):
                raise ValueError(f"{path}:{line_number} 세션 중복 또는 라벨 형식 오류")
            labels[session_id] = label
    return labels


def largest_burst(elapsed):
    start = 0
    largest = 0
    for end, second in enumerate(elapsed):
        while second - elapsed[start] >= 5:
            start += 1
        largest = max(largest, end - start + 1)
    return largest


def observe(events, seconds):
    grouped = {}
    for event in events:
        if event.action in ACTIONS:
            grouped.setdefault(event.session_id, []).append(event)
    observations = []
    cutoff = timedelta(seconds=seconds)
    for session_id, session_events in sorted(grouped.items()):
        ordered = sorted(session_events, key=lambda event: event.timestamp)
        first = ordered[0].timestamp
        window = [event for event in ordered if event.timestamp - first < cutoff]
        actions = Counter(event.action for event in window)
        outcomes = Counter(event.outcome for event in window)
        elapsed = [
            (event.timestamp - first).total_seconds()
            for event in window
            if event.action != "HOLD_EXPIRED"
        ]
        intervals = [right - left for left, right in zip(elapsed, elapsed[1:])]
        rule_count = sum(outcomes[outcome] for outcome in RULE_FLAGS)
        observations.append(
            Observation(
                session_id,
                (
                    len(elapsed),
                    largest_burst(elapsed),
                    median(intervals) if intervals else seconds,
                    actions["QUEUE_STATUS"],
                    actions["SEAT_HOLD"],
                    outcomes["SEAT_UNAVAILABLE"],
                    outcomes["HOLD_EXISTS"],
                    actions["SEAT_RELEASE"],
                    actions["HOLD_EXPIRED"],
                    actions["BOOKING_CONFIRM"],
                    rule_count,
                ),
                rule_count > 0,
            )
        )
    return observations


def classification(rows, flag):
    counts = Counter((row["label"], row[flag]) for row in rows)
    true_positive = counts["abuse", True]
    false_negative = counts["abuse", False]
    false_positive = counts["normal", True]
    true_negative = counts["normal", False]
    abuse_count = true_positive + false_negative
    normal_count = true_negative + false_positive
    return {
        "true_positive": true_positive,
        "false_negative": false_negative,
        "false_positive": false_positive,
        "true_negative": true_negative,
        "detection_rate": true_positive / abuse_count if abuse_count else None,
        "false_positive_rate": false_positive / normal_count if normal_count else None,
    }


def run_experiment(training, calibration, evaluation, labels, target_fpr, seed):
    splits = [
        {row.session_id for row in batch}
        for batch in (training, calibration, evaluation)
    ]
    if splits[0] & splits[1] or splits[0] & splits[2] or splits[1] & splits[2]:
        raise ValueError("학습, 기준 설정, 평가에 같은 세션을 사용했습니다")
    if len(training) < 10 or len(calibration) < 10 or not evaluation:
        raise ValueError("학습과 기준 설정에는 각각 10세션 이상, 평가에는 1세션 이상이 필요합니다")
    if labels is not None and set(labels) != splits[2]:
        raise ValueError("평가 라벨은 평가 로그의 세션과 정확히 일치해야 합니다")

    from sklearn.ensemble import IsolationForest

    model = IsolationForest(n_estimators=100, random_state=seed)
    model.fit([row.features for row in training])
    calibration_scores = sorted(
        -model.score_samples([row.features for row in calibration])
    )
    exceed_count = math.floor(len(calibration) * target_fpr)
    threshold = float(calibration_scores[len(calibration) - exceed_count - 1])

    scores = -model.score_samples([row.features for row in evaluation])
    rows = []
    for observation, score in zip(evaluation, scores):
        model_flag = bool(score > threshold)
        rows.append(
            {
                "sessionId": observation.session_id,
                "anomaly_score": float(score),
                "rule_flag": observation.rule_flag,
                "model_flag": model_flag,
                "combined_flag": observation.rule_flag or model_flag,
                "label": labels[observation.session_id] if labels is not None else None,
            }
        )

    report = {
        "training_sessions": len(training),
        "calibration_sessions": len(calibration),
        "evaluation_sessions": len(evaluation),
        "score_threshold": threshold,
        "target_calibration_false_positive_rate": target_fpr,
        "observed_calibration_false_positive_rate": (
            sum(score > threshold for score in calibration_scores) / len(calibration)
        ),
        "rule_flag_outcomes": sorted(RULE_FLAGS),
        "flagged": {
            flag: sum(row[flag] for row in rows)
            for flag in ("rule_flag", "model_flag", "combined_flag")
        },
    }
    if labels is not None:
        report["offline_classification"] = {
            flag: classification(rows, flag)
            for flag in ("rule_flag", "model_flag", "combined_flag")
        }
    return report, rows


def synthetic_sessions(prefix, normal_count, abuse_count, rng):
    events = []
    labels = {}
    origin = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for index in range(normal_count + abuse_count):
        session_id = f"{prefix}-{index}"
        abuse = index >= normal_count
        labels[session_id] = "abuse" if abuse else "normal"
        start = origin + timedelta(minutes=index * 3)
        timeline = [(0, "QUEUE_JOIN", "WAITING")]
        polls = rng.randint(1, 7)
        timeline.extend(
            (step * 2, "QUEUE_STATUS", "WAITING") for step in range(1, polls)
        )
        timeline.append((polls * 2, "QUEUE_STATUS", "ADMITTED"))
        admission = polls * 2 + 2

        if abuse and index % 3 == 0:
            # Repeated hold attempts while a session has an active hold.
            timeline.append((admission, "SEAT_HOLD", "HELD"))
            for attempt in range(1, rng.randint(8, 14)):
                timeline.append(
                    (admission + attempt * 3, "SEAT_HOLD", "HOLD_EXISTS")
                )
        elif abuse:
            for attempt in range(rng.randint(10, 24)):
                time = admission + attempt * 0.25 + rng.uniform(0, 0.08)
                outcome = "SEAT_UNAVAILABLE"
                if attempt >= 14 and index % 2 == 0:
                    outcome = "RATE_LIMITED"
                timeline.append((time, "SEAT_HOLD", outcome))
        else:
            time = admission + rng.uniform(0, 20)
            if index % 4 == 0:
                timeline.append((time, "SEAT_HOLD", "SEAT_UNAVAILABLE"))
                time += rng.uniform(2, 9)
            timeline.append((time, "SEAT_HOLD", "HELD"))
            if index % 5 == 0:
                timeline.append((time + 3, "SEAT_RELEASE", "RELEASED"))
                time += 6
                timeline.append((time, "SEAT_HOLD", "HELD"))
            if index % 7 != 0:
                timeline.append(
                    (time + rng.uniform(2, 15), "BOOKING_CONFIRM", "CONFIRMED")
                )

        for offset, action, outcome in timeline:
            events.append(
                Event(session_id, action, outcome, start + timedelta(seconds=offset))
            )
    return events, labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="고정 시드 합성 데이터로 실행")
    parser.add_argument("--train", type=Path, help="정상 이용 학습 JSONL")
    parser.add_argument("--calibrate", type=Path, help="임계값 설정용 정상 이용 JSONL")
    parser.add_argument("--evaluate", type=Path, help="평가 JSONL")
    parser.add_argument("--labels", type=Path, help="평가 세션별 sessionId,label CSV")
    parser.add_argument("--scores", type=Path, help="세션별 점수 JSONL 저장 경로")
    parser.add_argument("--window-seconds", type=int, default=120)
    parser.add_argument("--target-fpr", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    sources = (args.train, args.calibrate, args.evaluate)
    if args.demo:
        if any(sources) or args.labels:
            parser.error("--demo는 JSONL 및 라벨 입력과 함께 사용할 수 없습니다")
        rng = random.Random(args.seed)
        training, _ = synthetic_sessions("training", 80, 0, rng)
        calibration, _ = synthetic_sessions("calibration", 40, 0, rng)
        evaluation, labels = synthetic_sessions("evaluation", 45, 15, rng)
        dataset = "synthetic_demo"
    else:
        if not all(sources):
            parser.error("--train, --calibrate, --evaluate을 모두 지정하세요")
        dataset = "user_provided_logs"

    if args.window_seconds <= 0 or not 0 <= args.target_fpr < 1:
        parser.error("관찰 시간은 양수, 목표 오탐률은 0 이상 1 미만이어야 합니다")
    try:
        if not args.demo:
            training, calibration, evaluation = (read_events(path) for path in sources)
            labels = read_labels(args.labels) if args.labels else None
        report, rows = run_experiment(
            observe(training, args.window_seconds),
            observe(calibration, args.window_seconds),
            observe(evaluation, args.window_seconds),
            labels,
            args.target_fpr,
            args.seed,
        )
        if args.scores:
            input_paths = {path.resolve() for path in (*sources, args.labels) if path}
            if args.scores.resolve() in input_paths:
                raise ValueError("점수 출력 경로를 입력 파일과 다르게 지정하세요")
            with args.scores.open("w", encoding="utf-8") as output:
                for row in rows:
                    output.write(json.dumps(row, ensure_ascii=False) + "\n")
    except ModuleNotFoundError:
        parser.error("scikit-learn 설치가 필요합니다. experiment/requirements.txt를 설치하세요")
    except (OSError, ValueError) as error:
        parser.error(str(error))

    print(
        json.dumps(
            {
                "dataset": dataset,
                "observation_window_seconds": args.window_seconds,
                "feature_names": FEATURE_NAMES,
                **report,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
