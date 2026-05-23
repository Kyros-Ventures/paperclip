#!/usr/bin/env python3
"""
SLA Tracking Dashboard for Paperclip QA

Queries Paperclip API for all open issues, computes SLA compliance
based on priority-based deadlines, and reports overdue items.

SLA Targets:
  critical: 4 hours
  high:     24 hours
  medium:   72 hours
  low:      168 hours (1 week)
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Union
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "http://127.0.0.1:3101/api"
TEC_ID = "29a857f9-3e94-460c-8a91-9e2ed41e7967"

SLA_HOURS = {
    "critical": 4,
    "high": 24,
    "medium": 72,
    "low": 168,
}

OPEN_STATUSES = ["todo", "in_progress", "in_review", "blocked"]


def fetch_json(path: str) -> dict | list:
    """Fetch JSON from Paperclip API, handling data wrapper."""
    try:
        resp = urlopen(f"{BASE_URL}{path}", timeout=15)
        data = json.loads(resp.read())
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data
    except Exception as e:
        print(f"  ERROR fetching {path}: {e}", file=sys.stderr)
        return []


def fetch_issues_by_status(status: str) -> list:
    """Fetch issues filtered by status."""
    return fetch_json(f"/companies/{TEC_ID}/issues?status={status}")


def get_issue_detail(issue_id: str) -> dict | None:
    """Fetch a single issue with full details."""
    data = fetch_json(f"/issues/{issue_id}")
    return data[0] if isinstance(data, list) else data


def parse_created_at(issue: dict) -> datetime | None:
    """Parse createdAt field from issue."""
    raw = issue.get("createdAt")
    if not raw:
        return None
    try:
        # Handle ISO format with/without timezone
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def compute_sla_status(issue: dict, now: datetime) -> dict:
    """Compute SLA compliance for a single issue."""
    priority = (issue.get("priority") or "medium").lower()
    max_hours = SLA_HOURS.get(priority, 72)
    created = parse_created_at(issue)
    status = issue.get("status", "unknown")

    if not created:
        return {
            "identifier": issue.get("identifier", "?"),
            "title": issue.get("title", "?"),
            "priority": priority,
            "status": status,
            "age_hours": None,
            "sla_hours": max_hours,
            "compliant": True,
            "overdue_by_hours": None,
            "assignee": str(issue.get("assigneeAgentId", "?"))[:8],
        }

    age = (now - created).total_seconds() / 3600
    overdue_by = max(0, age - max_hours)

    # Blocked issues get double the SLA window
    if status == "blocked":
        max_hours *= 2
        overdue_by = max(0, age - max_hours)

    return {
        "identifier": issue.get("identifier", "?"),
        "title": issue.get("title", "?"),
        "priority": priority,
        "status": status,
        "age_hours": round(age, 1),
        "sla_hours": max_hours,
        "compliant": age <= max_hours,
        "overdue_by_hours": round(overdue_by, 1) if overdue_by > 0 else 0,
        "assignee": str(issue.get("assigneeAgentId", "?"))[:8],
    }


def main():
    now = datetime.now(timezone.utc)

    print("=" * 75)
    print(f"  PAPERCLIP SLA TRACKING DASHBOARD")
    print(f"  Generated: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Company: TechnoTrixx (TEC)")
    print("=" * 75)

    # Fetch all open issues
    all_issues = []
    for status in OPEN_STATUSES:
        issues = fetch_issues_by_status(status)
        all_issues.extend(issues)

    if not all_issues:
        print("\n  ✅ No open issues found. All clear!")
        return

    # Analyze each issue
    results = [compute_sla_status(i, now) for i in all_issues]
    results.sort(key=lambda r: (not r["compliant"], -(r["overdue_by_hours"] or 0)))

    # Summary
    total = len(results)
    overdue = [r for r in results if not r["compliant"]]
    compliant = total - len(overdue)
    compliance_pct = (compliant / total * 100) if total > 0 else 100

    print(f"\n  SUMMARY: {total} open issues")
    print(f"  ✅ Compliant:  {compliant} ({compliance_pct:.1f}%)")
    print(f"  ❌ Overdue:    {len(overdue)} ({100 - compliance_pct:.1f}%)")
    print()

    # Overdue alerts
    if overdue:
        print("  ╔══════════════════════════════════════════════════════════════════╗")
        print("  ║  🚨 OVERDUE ISSUES — SLA BREACHED                               ║")
        print("  ╚══════════════════════════════════════════════════════════════════╝")
        print()
        print(f"  {'ID':<12} {'Priority':<10} {'Status':<12} {'Age':>8} {'SLA':>8} {'Overdue':>10} {'Title'}")
        print(f"  {'-'*12} {'-'*10} {'-'*12} {'-'*8} {'-'*8} {'-'*10} {'-'*30}")
        for r in overdue:
            flag = "🔴" if r["overdue_by_hours"] > 24 else "🟠"
            print(
                f"  {flag} {r['identifier']:<9} "
                f"{r['priority']:<10} "
                f"{r['status']:<12} "
                f"{str(r['age_hours'])+'h':>8} "
                f"{str(r['sla_hours'])+'h':>8} "
                f"{str(r['overdue_by_hours'])+'h':>10} "
                f"{r['title'][:40]}"
            )
        print()

    # Compliance by priority
    print("  ╔══════════════════════════════════════════════════════════════════╗")
    print("  ║  📊 SLA COMPLIANCE BY PRIORITY                                  ║")
    print("  ╚══════════════════════════════════════════════════════════════════╝")
    print()
    priorities = ["critical", "high", "medium", "low"]
    for p in priorities:
        p_issues = [r for r in results if r["priority"] == p]
        p_overdue = [r for r in p_issues if not r["compliant"]]
        pct = (
            (len(p_issues) - len(p_overdue)) / len(p_issues) * 100
            if p_issues
            else 100
        )
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        flag = "🔴" if p in ("critical", "high") and p_overdue else "  "
        print(
            f"  {flag} {p:<8}: {bar} {pct:.0f}% "
            f"({len(p_issues) - len(p_overdue)}/{len(p_issues)})"
        )

    # Compliance by status
    print()
    print("  ╔══════════════════════════════════════════════════════════════════╗")
    print("  ║  📋 BY STATUS                                                   ║")
    print("  ╚══════════════════════════════════════════════════════════════════╝")
    print()
    for s in OPEN_STATUSES:
        s_issues = [r for r in results if r["status"] == s]
        s_overdue = [r for r in s_issues if not r["compliant"]]
        pct = (
            (len(s_issues) - len(s_overdue)) / len(s_issues) * 100
            if s_issues
            else 100
        )
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        print(
            f"  {s:<12}: {bar} {pct:.0f}% "
            f"({len(s_issues) - len(s_overdue)}/{len(s_issues)})"
        )

    print()
    print("=" * 75)


if __name__ == "__main__":
    main()
