#!/usr/bin/env python3
"""Cache exact locked GitHub archives via the official codeload endpoint.

This avoids downloading entire repository histories. Composer consumes the cache
normally; lockfiles, expected checksums, TLS verification and proxies are preserved.
"""
import concurrent.futures
import hashlib
import json
import os
import re
import ssl
import urllib.request
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
LOCK = json.loads((BASE / 'composer.lock').read_text())
CACHE = BASE / '.runtime/composer/cache/files'
CONTEXT = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or '/etc/ssl/certs/ca-certificates.crt')


def cache_package(package):
    dist = package['dist']
    match = re.fullmatch(r'https://api.github.com/repos/([\w.-]+/[\w.-]+)/zipball/([0-9a-f]{40})', dist['url'])
    if not match:
        raise RuntimeError('Unsupported archive source: ' + package['name'])
    repository, commit = match.groups()
    if (package['source']['url'].removesuffix('.git') != 'https://github.com/' + repository
            or package['source']['reference'] != commit or dist['reference'] != commit):
        raise RuntimeError('Locked archive/source identity mismatch: ' + package['name'])
    target = CACHE / package['name'] / (hashlib.sha1(dist['url'].encode()).hexdigest() + '.zip')
    if target.exists():
        with zipfile.ZipFile(target) as archive:
            if archive.testzip():
                raise RuntimeError('Invalid cached archive: ' + package['name'])
        if dist.get('shasum') and hashlib.sha1(target.read_bytes()).hexdigest() != dist['shasum']:
            raise RuntimeError('Cached checksum mismatch: ' + package['name'])
        return
    request = urllib.request.Request('https://codeload.github.com/' + repository + '/legacy.zip/' + commit,
                                     headers={'User-Agent': 'SDA-backend-setup'})
    with urllib.request.urlopen(request, context=CONTEXT, timeout=120) as response:
        data = response.read(256 * 1024 * 1024 + 1)
    if len(data) > 256 * 1024 * 1024:
        raise RuntimeError('Archive too large: ' + package['name'])
    if dist.get('shasum') and hashlib.sha1(data).hexdigest() != dist['shasum']:
        raise RuntimeError('Archive checksum mismatch: ' + package['name'])
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.part')
    temporary.write_bytes(data)
    with zipfile.ZipFile(temporary) as archive:
        if archive.testzip():
            raise RuntimeError('Corrupt archive: ' + package['name'])
    temporary.replace(target)


if __name__ == '__main__':
    packages = LOCK['packages'] + LOCK['packages-dev']
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(cache_package, packages))
    print('Verified locked Composer archives:', len(packages))
