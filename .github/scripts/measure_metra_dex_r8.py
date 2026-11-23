#!/usr/bin/env python3
"""Compare signed Play R8 pilot DEX against the unoptimized AAB #34.
This is a BUILD metric only; it does not certify Android runtime correctness.
"""
import json
import os
import sys
import zipfile
from pathlib import Path

BASELINE_AAB34_UNCOMPRESSED_DEX_BYTES = 22578248

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: measure_metra_dex_r8.py METRA-PlayStore.aab metrics.json")
    bundle, output = map(Path, sys.argv[1:])
    if not bundle.is_file() or bundle.stat().st_size == 0:
        raise SystemExit("AAB missing")
    mapping = bundle.parent / 'METRA-R8-mapping.txt'
    if not mapping.is_file() or mapping.stat().st_size < 100:
        raise SystemExit("R8 mapping.txt missing or empty; cannot symbolize crashes")
    with zipfile.ZipFile(bundle) as archive:
        dex = [entry for entry in archive.infolist() if entry.filename.endswith('.dex')]
        if not dex:
            raise SystemExit("AAB has no classes.dex")
        total = sum(item.file_size for item in dex)
        metadata = [entry.filename for entry in archive.infolist() if entry.filename.endswith('r8.json')]
    result = {
        "experiment": "METRA Dex R8 pilot, never production-approved by build alone",
        "github_run_number": os.environ.get("GITHUB_RUN_NUMBER"),
        "baseline_aab": "METRA Play candidate #34",
        "baseline_uncompressed_dex_bytes": BASELINE_AAB34_UNCOMPRESSED_DEX_BYTES,
        "optimized_uncompressed_dex_bytes": total,
        "dex_file_count": len(dex),
        "change_bytes": total - BASELINE_AAB34_UNCOMPRESSED_DEX_BYTES,
        "reduction_percent": round(100*(1-total/BASELINE_AAB34_UNCOMPRESSED_DEX_BYTES), 2),
        "r8_json_in_aab": metadata,
        "mapping_available": True,
        "bundle_bytes": bundle.stat().st_size,
    }
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    if total >= BASELINE_AAB34_UNCOMPRESSED_DEX_BYTES:
        raise SystemExit("R8 pilot did not reduce DEX vs #34: DO NOT RELEASE")

if __name__ == "__main__":
    main()
