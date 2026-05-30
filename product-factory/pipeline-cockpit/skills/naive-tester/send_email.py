#!/usr/bin/env python3
"""
Send a naive-tester report via Resend.

Usage:
  python send_email.py <to_email> "<subject>" <body_file_path>

Reads RESEND_API_KEY + RESEND_FROM_EMAIL + RESEND_FROM_NAME from
~/.claude/skills/naive-tester/.env (or shell env if not present).

Sender: noreply@updates.corporateaisolutions.com (verified subdomain).
Body: full markdown content from <body_file_path>. Sent as plain text +
basic HTML wrapper so the report renders in Gmail's web view as well
as plain-text clients.

Exits 0 on success, 1 on failure (prints error to stderr).
"""
import os
import sys
import json
from pathlib import Path
from urllib import request, error


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), val)


def md_to_basic_html(md: str) -> str:
    out = []
    for line in md.splitlines():
        if not line.strip():
            out.append("<br>")
        elif line.startswith("# "):
            out.append(f"<h2>{line[2:]}</h2>")
        elif line.startswith("## "):
            out.append(f"<h3>{line[3:]}</h3>")
        elif line.startswith("### "):
            out.append(f"<h4>{line[4:]}</h4>")
        elif line.startswith("- ") or line.startswith("* "):
            out.append(f"<li>{line[2:]}</li>")
        else:
            out.append(f"<div>{line}</div>")
    body = "\n".join(out)
    return (
        '<div style="font-family: -apple-system, system-ui, Helvetica, Arial, sans-serif; '
        'font-size: 14px; line-height: 1.5; max-width: 720px; margin: 0 auto;">'
        f"{body}</div>"
    )


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: send_email.py <to> <subject> <body_file>", file=sys.stderr)
        return 1
    to_addr, subject, body_file = sys.argv[1], sys.argv[2], sys.argv[3]

    skill_dir = Path(__file__).resolve().parent
    load_dotenv(skill_dir / ".env")

    api_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@updates.corporateaisolutions.com")
    from_name = os.environ.get("RESEND_FROM_NAME", "Naive Tester")
    if not api_key:
        print("RESEND_API_KEY not set (looked in .env + shell env)", file=sys.stderr)
        return 1

    body_text = Path(body_file).read_text(encoding="utf-8")
    body_html = md_to_basic_html(body_text)

    payload = {
        "from": f"{from_name} <{from_email}>",
        "to": [to_addr],
        "subject": subject,
        "text": body_text,
        "html": body_html,
    }

    req = request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "naive-tester/1.0 (+https://corporateaisolutions.com)",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"sent: id={data.get('id')}")
            return 0
    except error.HTTPError as e:
        print(f"resend HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"resend error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
