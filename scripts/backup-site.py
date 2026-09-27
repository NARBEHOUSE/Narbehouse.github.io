"""Make and verify a local backup, including Git history and uncommitted files."""
from pathlib import Path
import argparse, hashlib, json, os, zipfile

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
source = args.source.resolve(strict=True)
destination = args.destination.resolve()
if not source.is_dir() or destination.is_relative_to(source):
    raise SystemExit('Backup must be outside the source folder.')
if destination.exists():
    raise SystemExit('Refusing to overwrite an existing backup.')
destination.parent.mkdir(parents=True, exist_ok=True)
manifest = {}
with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
    for directory, folders, names in os.walk(source, followlinks=False):
        for name in sorted(folders + names):
            if (Path(directory) / name).is_symlink():
                raise SystemExit('Backup stopped: symbolic link requires review.')
        for name in sorted(names):
            file = Path(directory) / name
            before = file.stat()
            digest = hashlib.sha256()
            relative = file.relative_to(source).as_posix()
            with file.open('rb') as stream, archive.open(relative, 'w', force_zip64=True) as member:
                while block := stream.read(1024 * 1024):
                    digest.update(block)
                    member.write(block)
            after = file.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise SystemExit('Source changed during backup; do not use this archive.')
            manifest[relative] = digest.hexdigest()
print('Backup written. Verifying every archived file...', flush=True)
with zipfile.ZipFile(destination) as archive:
    assert set(archive.namelist()) == set(manifest)
    for name, expected in manifest.items():
        digest = hashlib.sha256()
        with archive.open(name) as stream:
            while block := stream.read(1024 * 1024):
                digest.update(block)
        assert digest.hexdigest() == expected, name
report = {'archive': destination.name, 'files': len(manifest), 'verified': True,
          'includesGitHistory': any(name.startswith('.git/') for name in manifest),
          'fileSHA256': manifest}
destination.with_suffix('.verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'fileSHA256'}), flush=True)
