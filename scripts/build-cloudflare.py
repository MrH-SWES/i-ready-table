#!/usr/bin/env python3
"""Build only public runtime assets from a pinned canonical Git commit."""
import argparse
import io
import json
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = json.loads((ROOT / 'deployment/source.json').read_text())
OLD_BASE = 'https://mrh-swes.github.io/math-things/'


def is_runtime(path):
    return path.startswith('apps/') or (
        '/' not in path and Path(path).suffix in {'.html', '.js', '.css'})


def validate_assets(output):
    class Assets(HTMLParser):
        def handle_starttag(self, tag, attributes):
            attrs = dict(attributes)
            url = attrs.get('src')
            if tag == 'link' and attrs.get('rel') == 'stylesheet':
                url = attrs.get('href')
            if not url:
                return
            parts = urlsplit(url)
            if parts.scheme or parts.netloc or not parts.path:
                return
            asset = ((output / unquote(parts.path).lstrip('/')) if parts.path.startswith('/')
                     else (self.page.parent / unquote(parts.path)))
            if not asset.exists():
                raise RuntimeError(f'Missing local asset: {self.page.relative_to(output)} -> {url}')
    for page in output.rglob('*.html'):
        parser = Assets()
        parser.page = page
        parser.feed(page.read_text())


def source_files(checkout):
    if checkout:
        # Read committed blobs, never dirty working files or local credentials.
        checkout = Path(checkout).resolve()
        paths = subprocess.check_output(
            ['git', '-C', str(checkout), 'ls-tree', '-r', '--name-only', SOURCE['commit']],
            text=True).splitlines()
        for path in paths:
            if is_runtime(path):
                yield path, subprocess.check_output(
                    ['git', '-C', str(checkout), 'show', SOURCE['commit'] + ':' + path])
    else:
        url = f"https://codeload.github.com/{SOURCE['repository']}/tar.gz/{SOURCE['commit']}"
        with urllib.request.urlopen(url, timeout=60) as response:
            archive = response.read()
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as archive:
            for member in archive:
                path = '/'.join(Path(member.name).parts[1:])
                if member.isfile() and is_runtime(path):
                    if '..' in Path(path).parts:
                        raise ValueError('Unsafe archive path')
                    yield path, archive.extractfile(member).read()


def adapt(path, data):
    if Path(path).suffix in {'.html', '.js', '.css'}:
        text = data.decode('utf-8').replace(OLD_BASE, '/math-things/')
        if path == 'apps/teaching-table/curriculum.js':
            text = text.replace(
                "Authorized JavaScript origin should include:\\nhttps://mrh-swes.github.io'",
                "Authorized JavaScript origin should include:\\n' + window.location.origin")
        return text.encode('utf-8')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', help='Optional local canonical clone; reads pinned Git blobs')
    args = parser.parse_args()
    output = ROOT / 'dist'
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    count = 0
    for path, data in source_files(args.source):
        data = adapt(path, data)
        target = output / 'math-things' / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        if path.startswith('apps/teaching-table/'):
            (output / Path(path).name).write_bytes(data)
        count += 1
    if not (output / 'index.html').is_file():
        raise RuntimeError('Canonical Teaching Table entry point missing')
    (output / '404.html').write_text('<!doctype html><title>Page not found</title>'
                                   '<h1>Page not found</h1><a href="/">Open Teaching Table</a>')
    (output / 'build-source.json').write_text(json.dumps(SOURCE, indent=2) + '\n')
    validate_assets(output)
    print(f"Built {count} canonical assets plus root Teaching Table from {SOURCE['commit']}")


if __name__ == '__main__':
    main()
