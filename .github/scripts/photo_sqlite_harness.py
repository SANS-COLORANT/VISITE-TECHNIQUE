"""JSON-lines SQLite adapter for executable photo repository tests (no network)."""
import json
import re
import sqlite3
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
connection = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else ':memory:', isolation_level=None)
connection.row_factory = sqlite3.Row
connection.execute('PRAGMA foreign_keys=ON')


def js_template_sql(raw: str) -> str:
    """Reproduce the quote escapes JavaScript removes when evaluating `sql: `...``.

    The harness reads migration source text directly instead of importing the JS
    module. Without this tiny decoding step, a source fragment such as \" inside
    a template literal reaches SQLite with a literal backslash even though the
    Android runtime receives only ". That makes trigger LIKE predicates behave
    differently in tests and production.
    """
    return raw.replace('\\"', '"').replace("\\'", "'").replace('\\`', '`')


for raw in sys.stdin:
    request = json.loads(raw)
    try:
        method = request['method']
        if method == 'migrate':
            start, end = request.get('params', [0, 33])
            for path in sorted((root / 'database/migrations').glob('[0-9]*.js')):
                number = int(path.name.split('_')[0])
                if start < number <= end:
                    sql = re.search(r'sql:\s*`([\s\S]*?)`', path.read_text(encoding='utf-8'))
                    if sql:
                        connection.executescript(js_template_sql(sql[1]))
            result = {'foreign_keys': connection.execute('PRAGMA foreign_key_check').fetchall()}
        elif method == 'exec':
            connection.executescript(request['sql'])
            result = None
        else:
            cursor = connection.execute(request['sql'], request.get('params') or [])
            result = [dict(row) for row in cursor.fetchall()] if method == 'all' else {'changes': cursor.rowcount, 'lastInsertRowId': cursor.lastrowid}
        print(json.dumps({'id': request['id'], 'result': result}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'id': request['id'], 'error': str(error)}), flush=True)
