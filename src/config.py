import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (two levels up from this file)
_root = Path(__file__).parent.parent
load_dotenv(_root / ".env")


@dataclass(frozen=True)
class ShoonyaConfig:
    user_id: str
    password: str
    vendor_code: str
    api_key: str
    imei: str
    totp_secret: str = ""   # Optional: auto-generates OTP when set.
                             # If empty, login() will prompt for OTP manually.


def _require(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise EnvironmentError(
            f"Missing required environment variable: {key}\n"
            f"Copy .env.example to .env and fill in all values."
        )
    return value


def _optional(key: str) -> str:
    return os.getenv(key, "").strip()


def load_shoonya_config() -> ShoonyaConfig:
    return ShoonyaConfig(
        user_id=_require("SHOONYA_USER_ID"),
        password=_require("SHOONYA_PASSWORD"),
        vendor_code=_require("SHOONYA_VENDOR_CODE"),
        api_key=_require("SHOONYA_API_KEY"),
        imei=_require("SHOONYA_IMEI"),
        totp_secret=_optional("SHOONYA_TOTP_SECRET"),
    )
