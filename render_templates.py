import os
from jinja2 import Template
import re
import shutil

BASE_DIR = os.path.dirname(__file__)
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')
OUT_DIR = os.path.join(BASE_DIR, 'site')

# Ensure output dir
if os.path.exists(OUT_DIR):
    shutil.rmtree(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

# Copy static directory
if os.path.exists(STATIC_DIR):
    shutil.copytree(STATIC_DIR, os.path.join(OUT_DIR, 'static'))

# List of templates to render (renders all .html files in templates)
templates = [f for f in os.listdir(TEMPLATES_DIR) if f.endswith('.html')]

for tfile in templates:
    src_path = os.path.join(TEMPLATES_DIR, tfile)
    with open(src_path, 'r', encoding='utf-8') as fh:
        content = fh.read()

    # Replace Flask url_for(...) calls with relative paths for static hosting
    # e.g. {{ url_for('static', filename='anarcroom.css') }} -> static/anarcroom.css
    def replace_url_for(match):
        inner = match.group(1)
        # find filename parameter
        m = re.search(r"filename\s*=\s*['\"]([^'\"]+)['\"]", inner)
        if m:
            fname = m.group(1)
            return 'static/' + fname
        return 'static'

    content = re.sub(r"\{\{\s*(url_for\([^}]+\))\s*\}\}", replace_url_for, content)

    # Render Jinja expressions other than url_for if present. Provide defaults for variables used.
    template = Template(content)

    # sensible defaults
    class DummyRequest:
        def __init__(self, host='.'):
            self.host = host

    context = {
        'codigo': 'EXEMPLO',
        'request': DummyRequest(host='.'),
    }

    rendered = template.render(**context)

    out_path = os.path.join(OUT_DIR, tfile)
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(rendered)

print('Rendered templates ->', OUT_DIR)
print('Copy static ->', os.path.join(OUT_DIR, 'static'))
