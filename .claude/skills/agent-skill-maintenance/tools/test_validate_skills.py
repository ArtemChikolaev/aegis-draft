import tempfile
import unittest
from pathlib import Path
from validate_skills import validate


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / '.claude/skills/example'
        self.folder.mkdir(parents=True)
        self.skill = self.folder / 'SKILL.md'
        self.skill.write_text('---\nname: example\ndescription: "Use for example tasks."\n---\n\n# Example\n')
        for adapter in ('.agents/skills', '.codex/skills'):
            directory = self.root / adapter
            directory.mkdir(parents=True)
            (directory / 'example').symlink_to('../../.claude/skills/example', target_is_directory=True)
        index = self.root / 'docs/ai/INDEX.md'
        index.parent.mkdir(parents=True)
        index.write_text('[example](../../.claude/skills/example/SKILL.md)')

    def test_valid(self):
        self.assertEqual(validate(self.root), [])

    def test_bad_metadata(self):
        for bad in ('name: different', 'name: example\nname: example', 'name: [example', 'description: ' + 'x' * 201):
            with self.subTest(bad=bad):
                self.skill.write_text('---\n' + bad + '\n---\n\n# Example\n')
                self.assertTrue(validate(self.root))

    def test_missing_reference(self):
        with self.skill.open('a') as file:
            file.write('[missing](references/missing.md)')
        self.assertTrue(any('missing/outside' in error for error in validate(self.root)))

    def test_regular_copy_rejected(self):
        link = self.root / '.agents/skills/example'
        link.unlink()
        link.mkdir()
        (link / 'SKILL.md').write_text(self.skill.read_text())
        self.assertTrue(any('expected symlink' in error for error in validate(self.root)))

    def test_missing_adapter(self):
        (self.root / '.codex/skills/example').unlink()
        self.assertTrue(any('inventory differs' in error for error in validate(self.root)))

    def test_wrong_target(self):
        link = self.root / '.agents/skills/example'
        link.unlink()
        link.symlink_to('../../missing')
        self.assertTrue(any('expected symlink' in error for error in validate(self.root)))

    def test_missing_index_entry(self):
        (self.root / 'docs/ai/INDEX.md').write_text('# Empty')
        self.assertTrue(any('INDEX' in error for error in validate(self.root)))

    def test_absolute_adapter_rejected(self):
        link = self.root / '.agents/skills/example'
        link.unlink()
        link.symlink_to(self.folder, target_is_directory=True)
        self.assertTrue(any('relative symlink' in error for error in validate(self.root)))

    def test_absolute_local_links_rejected(self):
        original = self.skill.read_text()
        for target in (str(self.skill), self.skill.as_uri()):
            with self.subTest(target=target):
                self.skill.write_text(original + f'\n[local]({target})\n')
                self.assertTrue(any('relative local link' in error for error in validate(self.root)))

    def test_relative_and_web_links_allowed(self):
        with self.skill.open('a') as file:
            file.write('\n[self](SKILL.md) [web](https://example.com/guide) [section](#example)\n')
        self.assertEqual(validate(self.root), [])


if __name__ == '__main__':
    unittest.main()
