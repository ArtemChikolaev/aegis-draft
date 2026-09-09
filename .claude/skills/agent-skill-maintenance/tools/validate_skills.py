#!/usr/bin/env python3
"""Read-only checks of canonical skills, adapters and local Markdown links."""
import argparse
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
import yaml


class UniqueLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'duplicate YAML key: {key}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def validate(root):
    errors = []
    base = root / '.claude/skills'
    skills = {p.name: p for p in base.iterdir() if p.is_dir()} if base.is_dir() else {}
    if not skills:
        return ['No canonical skills found']
    for name, folder in sorted(skills.items()):
        path = folder / 'SKILL.md'
        if folder.is_symlink() or not path.is_file():
            errors.append(f'{name}: canonical directory must contain SKILL.md and not be a symlink')
            continue
        raw = path.read_text()
        try:
            match = re.match(r'\A---\n(.*?)\n---\n(.+)', raw, re.S)
            if not match:
                raise ValueError('missing frontmatter or body')
            data = yaml.load(match[1], Loader=UniqueLoader)
            if not isinstance(data, dict):
                raise ValueError('frontmatter must be a mapping')
            if data.get('name') != name or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or len(name) > 64:
                raise ValueError('invalid/mismatched name')
            description = data.get('description')
            if not isinstance(description, str) or not 1 <= len(description.strip()) <= 200:
                raise ValueError('description must be 1–200 characters (project policy)')
            if len(raw.splitlines()) > 500:
                raise ValueError('SKILL.md exceeds local 500-line budget; move details to references')
        except (ValueError, TypeError, yaml.YAMLError) as exc:
            errors.append(f'{name}: {exc}')
        for doc in folder.rglob('*.md'):
            text = doc.read_text()
            if '[[' in text:
                errors.append(f'{doc.relative_to(root)}: use Markdown links instead of wiki links')
            # Repository policy: inline relative links, no reference-style resource indirection.
            for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', text):
                target = target.strip().strip('<>')
                parsed = urlsplit(target)
                if parsed.scheme == 'file' or (not parsed.scheme and Path(unquote(parsed.path)).is_absolute()):
                    errors.append(f'{doc.relative_to(root)}: use a relative local link: {target}')
                    continue
                if parsed.scheme or target.startswith('#'):
                    continue
                linked = (doc.parent / unquote(parsed.path)).resolve()
                if not linked.is_relative_to(root.resolve()) or not linked.exists():
                    errors.append(f'{doc.relative_to(root)}: missing/outside local link {target}')
    for adapter in ('.agents/skills', '.codex/skills'):
        directory = root / adapter
        entries = {p.name: p for p in directory.iterdir()} if directory.is_dir() else {}
        if set(entries) != set(skills):
            errors.append(f'{adapter}: inventory differs: {sorted(set(entries) ^ set(skills))}')
        for name in set(entries) & set(skills):
            if not entries[name].is_symlink() or entries[name].resolve() != skills[name].resolve():
                errors.append(f'{adapter}/{name}: expected symlink to canonical directory')
            elif entries[name].readlink().is_absolute():
                errors.append(f'{adapter}/{name}: expected relative symlink for portable checkout')
    index = root / 'docs/ai/INDEX.md'
    listed = set(re.findall(r'\]\(\.\./\.\./\.claude/skills/([a-z0-9-]+)/SKILL\.md\)', index.read_text())) if index.exists() else set()
    if listed != set(skills):
        errors.append(f'INDEX: skill inventory differs: {sorted(listed ^ set(skills))}')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[4])
    args = parser.parse_args()
    issues = validate(args.root)
    for issue in issues:
        print(f'ERROR: {issue}')
    print(f'Skill validation: {len(issues)} error(s)')
    raise SystemExit(bool(issues))
