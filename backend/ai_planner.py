"""AmmiAI AI personalization layer.

Given profile + pantry + 3 candidate day-plans from the deterministic engine,
call Anthropic Claude Sonnet to pick and reorder the best weekly plan and
generate a one-line reason per day. Strict JSON output, validated + retried
once. On second failure, silently falls back to the rule-based first candidate.

Keys and models
---------------
- Reads ANTHROPIC_API_KEY at call time from the environment.
- Uses the official `anthropic` Python SDK (public PyPI) so the deploy is
  fully self-contained — no private pip index required.
- Model: `claude-sonnet-4-5` by default (override via ANTHROPIC_MODEL env).
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from anthropic import AsyncAnthropic

logger = logging.getLogger("ammiai.ai_planner")

AI_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
MAX_RETRIES = 1  # one retry on JSON parse / validation failure → 2 attempts total


SYSTEM_PROMPT = (
    "You are AmmiAI, a Tamil home-kitchen meal planner. You are given a user "
    "profile, a pantry snapshot with expiry flags, and THREE candidate day-plans "
    "for each day of a 7-day week. Each candidate day-plan contains breakfast, "
    "lunch and dinner slots with recipe ids and names.\n\n"
    "Your job is to:\n"
    "  1. For each of the 7 days, pick the ONE best candidate index (0, 1 or 2) "
    "     that best matches the user's diet, favourites, spice tolerance, and "
    "     rescues ingredients marked as expiring soon (red/yellow flag). Prefer "
    "     candidates that use expiring items or the user's favourite dishes.\n"
    "  2. Return the chosen recipe_ids grouped by slot in the exact structure "
    "     shown below, keeping the recipe order the same as the candidate you "
    "     picked (so meal_engine invariants stay intact).\n"
    "  3. Write ONE short reason (<= 22 words) per day, in English, that names "
    "     a dish + why it fits (e.g., pantry rescue, protein, favourite). "
    "     Reference actual dish names, not ids.\n\n"
    "Return STRICT JSON — a top-level array of exactly 7 objects, no prose, no "
    "markdown fences, no trailing commas. Every date and recipe_id must exist "
    "in the input. Schema:\n"
    "[\n"
    "  {\n"
    "    \"date\": \"YYYY-MM-DD\",\n"
    "    \"candidate_index\": 0|1|2,\n"
    "    \"slots\": {\n"
    "      \"breakfast\": [\"recipe_id\", ...],\n"
    "      \"lunch\":     [\"recipe_id\", ...],\n"
    "      \"dinner\":    [\"recipe_id\", ...]\n"
    "    },\n"
    "    \"reason\": \"string\"\n"
    "  }\n"
    "]\n"
    "Nothing else. No preamble, no closing sentence."
)


# ---------------- Helpers ---------------- #
def _key() -> str:
    return (os.environ.get("ANTHROPIC_API_KEY") or "").strip()


def is_configured() -> bool:
    return bool(_key())


def _slim_meal(meal: Dict[str, Any]) -> Dict[str, Any]:
    """Extract just id + name so the prompt stays small."""
    items = meal.get("items") or []
    return {
        "items": [
            {
                "id": it.get("id"),
                "name_en": it.get("name_en"),
                "name_ta": it.get("name_ta"),
                "category": it.get("category"),
            }
            for it in items
            if it.get("id")
        ],
        "chip": meal.get("chip"),
    }


def _slim_day_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "date": plan.get("date"),
        "breakfast": _slim_meal(plan.get("breakfast", {})),
        "lunch": _slim_meal(plan.get("lunch", {})),
        "dinner": _slim_meal(plan.get("dinner", {})),
    }


def _slim_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "diet": profile.get("diet"),
        "household_size": profile.get("household_size"),
        "spice_level": profile.get("spice_level"),
        "allergies": profile.get("allergies") or [],
        "favorites": profile.get("favorites") or [],
        "health_goals": (profile.get("health") or {}).get("goals") or [],
    }


def _slim_pantry(pantry_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for it in pantry_items:
        out.append(
            {
                "ingredient_id": it.get("ingredient_id"),
                "name": it.get("ingredient_name") or it.get("ingredient_id"),
                "qty": it.get("qty"),
                "unit": it.get("unit"),
                "freshness": it.get("freshness"),  # green | yellow | red
                "days_left": it.get("days_left"),
            }
        )
    return out


def build_prompt(
    profile: Dict[str, Any],
    pantry_items: List[Dict[str, Any]],
    candidates_by_date: Dict[str, List[Dict[str, Any]]],
) -> str:
    """Compact JSON payload to send to Claude."""
    payload = {
        "profile": _slim_profile(profile),
        "pantry_snapshot": _slim_pantry(pantry_items),
        "days": [
            {
                "date": d,
                "candidates": [_slim_day_plan(c) for c in cands],
            }
            for d, cands in sorted(candidates_by_date.items())
        ],
    }
    return json.dumps(payload, ensure_ascii=False)


# ---------------- Validation ---------------- #
_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json_array(text: str) -> str:
    """Strip markdown fences and any preamble/postamble around the JSON array."""
    if not text:
        return ""
    m = _JSON_BLOCK_RE.search(text)
    if m:
        text = m.group(1)
    text = text.strip()
    # Cut everything before the first '[' and after the last ']'
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def _validate_response(
    raw: str,
    candidates_by_date: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Parse + validate the AI response against candidates. Raises ValueError."""
    body = _extract_json_array(raw)
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON parse failed: {exc}") from exc

    if not isinstance(data, list):
        raise ValueError("Root must be a list")
    if len(data) != len(candidates_by_date):
        raise ValueError(
            f"Expected {len(candidates_by_date)} days, got {len(data)}"
        )

    expected_dates = set(candidates_by_date.keys())
    seen_dates: set[str] = set()
    validated: List[Dict[str, Any]] = []

    for entry in data:
        if not isinstance(entry, dict):
            raise ValueError("Each day entry must be an object")
        date = entry.get("date")
        if date not in expected_dates:
            raise ValueError(f"Unknown date {date!r}")
        if date in seen_dates:
            raise ValueError(f"Duplicate date {date!r}")
        seen_dates.add(date)

        ci = entry.get("candidate_index")
        if ci not in (0, 1, 2):
            raise ValueError(f"candidate_index must be 0/1/2, got {ci!r}")
        cand = candidates_by_date[date][ci]

        slots = entry.get("slots") or {}
        if not isinstance(slots, dict):
            raise ValueError("slots must be an object")
        valid_ids: Dict[str, set[str]] = {}
        for mk in ("breakfast", "lunch", "dinner"):
            ids = slots.get(mk) or []
            if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
                raise ValueError(f"slots.{mk} must be a list[str]")
            allowed = {it.get("id") for it in (cand.get(mk) or {}).get("items", []) if it.get("id")}
            for rid in ids:
                if rid not in allowed:
                    raise ValueError(
                        f"recipe_id {rid!r} not in candidate {ci} for {date} {mk}"
                    )
            valid_ids[mk] = set(ids)

        reason = str(entry.get("reason") or "").strip()
        if not reason:
            raise ValueError(f"reason missing for {date}")

        validated.append(
            {
                "date": date,
                "candidate_index": ci,
                "slots": {mk: list(valid_ids[mk]) for mk in ("breakfast", "lunch", "dinner")},
                "reason": reason,
            }
        )

    # sort by date ascending for deterministic downstream use
    validated.sort(key=lambda x: x["date"])
    return validated


# ---------------- Anthropic call ---------------- #
async def _call_anthropic(session_id: str, user_prompt: str) -> str:
    """Non-streaming Messages API call. Returns concatenated text response."""
    client = AsyncAnthropic(api_key=_key())
    resp = await client.messages.create(
        model=AI_MODEL,
        max_tokens=3000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    # session_id is retained only for logging / diagnostic parity.
    logger.debug("anthropic call ok session=%s", session_id)
    parts: List[str] = []
    for block in resp.content or []:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts)


# ---------------- Fallback ---------------- #
def fallback_plan(
    candidates_by_date: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Rule-based fallback: always take candidate 0 for each day."""
    out: List[Dict[str, Any]] = []
    for date in sorted(candidates_by_date.keys()):
        cand = candidates_by_date[date][0]
        slots = {}
        for mk in ("breakfast", "lunch", "dinner"):
            slots[mk] = [
                it.get("id") for it in (cand.get(mk) or {}).get("items", []) if it.get("id")
            ]
        out.append(
            {
                "date": date,
                "candidate_index": 0,
                "slots": slots,
                "reason": "Balanced Tamil day plan from your pantry.",
                "ai_fallback": True,
            }
        )
    return out


# ---------------- Entry point ---------------- #
async def personalize_week(
    profile: Dict[str, Any],
    pantry_items: List[Dict[str, Any]],
    candidates_by_date: Dict[str, List[Dict[str, Any]]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Returns (per_day_plans, meta). meta.source is 'ai' or 'fallback'.

    Never raises — silent fallback on 2nd failure.
    """
    if not is_configured():
        return fallback_plan(candidates_by_date), {
            "source": "fallback",
            "reason": "no_api_key",
            "model": AI_MODEL,
        }

    prompt = build_prompt(profile, pantry_items, candidates_by_date)
    session_id = f"ammiai-week-{uuid.uuid4().hex[:12]}"

    last_error: Optional[str] = None
    for attempt in range(1, MAX_RETRIES + 2):  # 1..2
        try:
            raw = await _call_anthropic(session_id, prompt)
            validated = _validate_response(raw, candidates_by_date)
            return validated, {
                "source": "ai",
                "model": AI_MODEL,
                "attempts": attempt,
            }
        except Exception as exc:  # broad — never propagate to the caller
            last_error = str(exc)
            logger.warning(
                "AI planner attempt %s failed: %s", attempt, last_error
            )
            # add a nudge to the second turn to help Claude self-correct
            prompt = (
                prompt
                + f"\n\nPREVIOUS RESPONSE FAILED VALIDATION: {last_error}. "
                "Reply with STRICT JSON only, matching the exact schema."
            )

    return fallback_plan(candidates_by_date), {
        "source": "fallback",
        "reason": "validation_failed",
        "last_error": last_error,
        "model": AI_MODEL,
    }
