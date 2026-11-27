# Combines the city layout with the deterministic code analysis into one CityModel.
from .analysis import analyze
from .layout import build_city
from .models import CityModel
from .scan.model import ScanResult


def build_full_city(scan: ScanResult) -> CityModel:
    city = build_city(scan)
    analysis = analyze(scan)
    return city.model_copy(update={"edges": analysis.edges, "symbols": analysis.symbols})
