from io import BytesIO
from pathlib import Path
import base64
import zipfile

from docx import Document
from docx.shared import Pt


def main():
    buffer = BytesIO()
    document = Document()
    normal = document.styles['Normal']
    normal.font.name = 'Arial'
    normal.font.size = Pt(10)
    paragraph = document.paragraphs[0] if document.paragraphs else document.add_paragraph()
    paragraph.text = 'METRA_TEMPLATE_PLACEHOLDER'
    document.save(buffer)

    payload = buffer.getvalue()
    if not payload.startswith(b'PK'):
        raise SystemExit('Generated DOCX skeleton has no ZIP signature')

    with zipfile.ZipFile(BytesIO(payload), 'r') as archive:
        required = {
            '[Content_Types].xml',
            '_rels/.rels',
            'word/document.xml',
            'word/_rels/document.xml.rels',
            'word/styles.xml',
            'word/settings.xml',
            'word/fontTable.xml',
            'word/theme/theme1.xml',
        }
        missing = sorted(required.difference(archive.namelist()))
        if missing:
            raise SystemExit(f'DOCX skeleton incomplete: {missing}')

    encoded = base64.b64encode(payload).decode('ascii')
    Path('wordDocxTemplate.generated.js').write_text(
        "// Generated during the Android build from a standards-compliant python-docx skeleton.\n"
        f"export const WORD_DOCX_TEMPLATE_BASE64 = '{encoded}';\n",
        encoding='utf-8',
    )
    print(f'Office-compatible DOCX skeleton generated: {len(payload)} bytes')


if __name__ == '__main__':
    main()
