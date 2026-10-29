"""affectors — распространение «влияния» (affect) между блоками на numpy/torch."""

from affectors.core import (
    Transformations,
    AffectionBlock,
    AffectionBlockClassic,
)

__version__ = "0.1.0"

__all__ = [
    "Transformations",
    "AffectionBlock",
    "AffectionBlockClassic",
    "__version__",
]
