#!/usr/bin/env python3
"""Build a deterministic, upload-ready Agent Skill ZIP."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import zipfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SKILL = REPOSITORY_ROOT / "skills" / "abcd-cisis-pft-fst"
DEFAULT_OUTPUT = REPOSITORY_ROOT / "artifacts" / "abcd-cisis-pft-fst.zip"
IGNORED_NAMES = {".DS_Store", "__pycache__"}


class PackageError(Exception):
    pass


def read_metadata(skill: Path) -> tuple[str, str]:
    manifest = skill / "SKILL.md"
    if not manifest.is_file():
        raise PackageError(f"Missing required manifest: {manifest}")
    source = manifest.read_text(encoding="utf-8")
    frontmatter = re.match(r"\A---\s*\n(.*?)\n---(?:\s*\n|\Z)", source, re.DOTALL)
    if not frontmatter:
        raise PackageError("SKILL.md must start with YAML frontmatter.")
    values: dict[str, str] = {}
    for line in frontmatter.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            values[key.strip()] = value.strip().strip('"\'')
    name = values.get("name", "")
    description = values.get("description", "")
    if not re.fullmatch(r"[a-z0-9-]{1,64}", name):
        raise PackageError("Skill name must contain 1-64 lowercase letters, digits, or hyphens.")
    if name != skill.name:
        raise PackageError(f'Skill folder "{skill.name}" must match metadata name "{name}".')
    if not description or len(description) > 200:
        raise PackageError("Skill description must contain 1-200 characters for Claude uploads.")
    for reference in re.findall(r"\]\((references/[^)#]+)", source):
        if not (skill / reference).is_file():
            raise PackageError(f"SKILL.md references missing file: {reference}")
    return name, description


def skill_files(skill: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(skill.rglob("*")):
        if path.is_symlink():
            raise PackageError(f"Symlinks are not allowed in portable skill archives: {path}")
        if not path.is_file() or any(part in IGNORED_NAMES for part in path.parts) or path.suffix == ".pyc":
            continue
        files.append(path)
    if not files:
        raise PackageError("Skill directory contains no packageable files.")
    return files


def write_archive(skill: Path, output: Path, files: list[Path]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.tmp")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in files:
                relative = path.relative_to(skill)
                info = zipfile.ZipInfo(f"{skill.name}/{relative.as_posix()}", date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100644 & 0xFFFF) << 16
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def verify_archive(output: Path, skill_name: str) -> None:
    try:
        with zipfile.ZipFile(output, "r") as archive:
            names = archive.namelist()
            required = f"{skill_name}/SKILL.md"
            if required not in names:
                raise PackageError(f"Archive is missing {required}.")
            prefix = f"{skill_name}/"
            if any(not name.startswith(prefix) or ".." in Path(name).parts for name in names):
                raise PackageError("Every ZIP entry must be inside the top-level skill folder.")
            corrupt = archive.testzip()
            if corrupt:
                raise PackageError(f"ZIP integrity check failed at {corrupt}.")
    except zipfile.BadZipFile as error:
        raise PackageError(f"Invalid ZIP archive: {error}") from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", type=Path, default=DEFAULT_SKILL, help="Skill directory to package")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Destination ZIP file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    skill = args.skill.resolve()
    output = args.output.resolve()
    try:
        if output.is_relative_to(skill):
            raise PackageError("Output ZIP must be outside the skill directory.")
        name, _ = read_metadata(skill)
        files = skill_files(skill)
        write_archive(skill, output, files)
        verify_archive(output, name)
    except (OSError, PackageError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"Created {output} ({len(files)} files, {output.stat().st_size} bytes)")
    print(f"SHA-256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
