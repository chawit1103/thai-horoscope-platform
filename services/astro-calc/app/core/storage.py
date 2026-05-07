from __future__ import annotations

from app.schemas import ChartSnapshot


class ChartSnapshotStore:
    def __init__(self) -> None:
        self._snapshots: dict[str, ChartSnapshot] = {}

    def store(self, snapshot: ChartSnapshot) -> ChartSnapshot:
        existing = self._snapshots.get(snapshot.calculation_hash)
        if existing:
            return existing
        self._snapshots[snapshot.calculation_hash] = snapshot
        return snapshot

    def get(self, calculation_hash: str) -> ChartSnapshot | None:
        return self._snapshots.get(calculation_hash)

    def all(self) -> list[ChartSnapshot]:
        return list(self._snapshots.values())
