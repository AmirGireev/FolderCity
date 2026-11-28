# Combines the city layout with the deterministic code analysis into one CityModel.
from .analysis import analyze
from .layout import build_city
from .models import CityModel, Metrics
from .scan.model import ScanResult


def build_full_city(scan: ScanResult) -> CityModel:
    city = build_city(scan)
    analysis = analyze(scan)
    nodes = []
    for node in city.nodes:
        extra = analysis.file_metrics.get(node.id) if node.type in ("file", "empty_file") else None
        if extra:
            merged = {**node.metrics.model_dump(exclude_none=True), **extra}
            node = node.model_copy(update={"metrics": Metrics(**merged)})
        nodes.append(node)
    return city.model_copy(
        update={
            "nodes": nodes,
            "edges": analysis.edges,
            "symbols": analysis.symbols,
            "architecture": analysis.architecture,
            "findings": analysis.findings,
        }
    )
