import sys
import struct
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from zen_camera_patch import zen_layout, preserve_other_exports


class ZenPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / 'research/repair03-readback/raw/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap').read_bytes()

    def test_actual_bahrain_export_bundles(self):
        layout = zen_layout(self.raw)
        self.assertEqual(len(layout['physical']), 208)
        result, count = preserve_other_exports(self.raw, self.raw, [])
        self.assertEqual(result, self.raw)
        self.assertEqual(count, 208)

    def test_selective_payload_preservation(self):
        layout = zen_layout(self.raw)
        edited = bytearray(self.raw)
        edited[layout['physical'][72][0]] ^= 1
        edited[layout['physical'][164][0]] ^= 1
        result, count = preserve_other_exports(self.raw, edited, [72])
        self.assertNotEqual(result[layout['physical'][72][0]], self.raw[layout['physical'][72][0]])
        self.assertEqual(result[layout['physical'][164][0]], self.raw[layout['physical'][164][0]])
        self.assertEqual(count, 207)

    def test_changed_identity_and_truncation_rejected(self):
        layout = zen_layout(self.raw)
        edited = bytearray(self.raw)
        edited[layout['exports'] + 24] ^= 1
        with self.assertRaisesRegex(ValueError, 'identity'):
            preserve_other_exports(self.raw, edited, [72])
        with self.assertRaises(ValueError):
            zen_layout(self.raw[:-1])
        edited = bytearray(self.raw)
        struct.pack_into('<i', edited, 36, 0)
        with self.assertRaises(ValueError):
            zen_layout(edited)


if __name__ == '__main__':
    unittest.main()
