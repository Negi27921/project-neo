"""
Pydantic response models and Decimal→float conversion.
"""

from decimal import Decimal
from typing import Any
from pydantic import BaseModel, model_validator


def d2f(v: Any) -> Any:
    """Convert Decimal to float, recursively for dicts/lists."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, dict):
        return {k: d2f(val) for k, val in v.items()}
    if isinstance(v, list):
        return [d2f(i) for i in v]
    return v
