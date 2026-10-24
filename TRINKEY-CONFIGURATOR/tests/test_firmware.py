import ast
import importlib
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'firmware'))
import narbe_config as config
sys.modules["narbe_settings"] = config

class Memory(bytearray):
    def __init__(self):
        super().__init__(64)
        self.writes = 0
    def __setitem__(self, key, value):
        self.writes += 1
        super().__setitem__(key, value)

class ConfigTests(unittest.TestCase):
    def test_all_firmware_parses(self):
        for filename in (ROOT / 'firmware').glob('*.py'):
            ast.parse(filename.read_text(), filename=str(filename))
    def test_round_trip_and_persistence(self):
        memory = Memory()
        value = ('K', 43, 2, 'M', 1, 0, 'S')
        self.assertEqual(config.save(memory, value), value)
        self.assertEqual(config.load(memory), value)
        config.save(memory, value)
        self.assertEqual(memory.writes, 1)
    def test_bad_memory_falls_back_to_defaults(self):
        memory = Memory()
        self.assertEqual(config.load(memory), config.DEFAULT)
        config.save(memory, ('M', 2, 0, 'K', 80, 1, 'R'))
        memory[7] = 12
        self.assertEqual(config.load(memory), config.DEFAULT)
    def test_invalid_settings_do_not_write(self):
        for value in [('K', 0, 0, 'K', 40, 0, 'A'), ('M', 3, 0, 'K', 40, 0, 'A'), ('M', 1, 2, 'K', 40, 0, 'A'), ('K', 44, 0, 'K', 40, 0, 'Z')]:
            memory = Memory()
            with self.assertRaises(ValueError):
                config.save(memory, value)
            self.assertEqual(memory.writes, 0)
    def test_shared_key_releasing_one_keeps_other_held(self):
        settings = ('K', 43, 2, 'K', 43, 1, 'A')
        keys, mouse = config.reports(settings, (True, True))
        self.assertEqual(list(keys), [3, 0, 43, 0, 0, 0, 0, 0])
        keys, mouse = config.reports(settings, (False, True))
        self.assertEqual(list(keys), [1, 0, 43, 0, 0, 0, 0, 0])
    def test_mouse_buttons_hold_together(self):
        settings = ('M', 1, 0, 'M', 2, 0, 'A')
        self.assertEqual(config.reports(settings, (True, True))[1][0], 3)
        self.assertEqual(config.reports(settings, (False, True))[1][0], 2)
        self.assertEqual(config.reports(settings, (False, False))[1][0], 0)

class Clock:
    value = 0
    def monotonic(self):
        return self.value
    def sleep(self, duration):
        self.value += duration

class Pin:
    def __init__(self):
        self.value = True
    def switch_to_input(self, **kwargs):
        pass
    def switch_to_output(self, value=False):
        self.value = value

class HID:
    def __init__(self, usage):
        self.usage_page = 1
        self.usage = usage
        self.sent = []
    def send_report(self, report):
        self.sent.append(bytes(report))

class Serial:
    def __init__(self):
        self.connected = True
        self.input = bytearray()
        self.output = bytearray()
        self.limit = 999
    @property
    def in_waiting(self):
        return len(self.input)
    def read(self, count):
        data = self.input[:count]
        del self.input[:count]
        return data
    def write(self, data):
        count = min(len(data), self.limit)
        self.output.extend(data[:count])
        return count

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.keyboard, self.mouse = HID(6), HID(2)
        self.serial = Serial()
        self.memory = Memory()
        self.board = types.SimpleNamespace(TIP=Pin(), RING_1=Pin(), SLEEVE=Pin(), RING_2=Pin())
        modules = {
            'board': self.board,
            'digitalio': types.SimpleNamespace(DigitalInOut=lambda p: p, Pull=types.SimpleNamespace(UP=1)),
            'microcontroller': types.SimpleNamespace(nvm=self.memory, cpu=types.SimpleNamespace(uid=b'unit01')),
            'usb_cdc': types.SimpleNamespace(data=self.serial),
            'usb_hid': types.SimpleNamespace(devices=[self.keyboard, self.mouse]),
        }
        sys.modules.update(modules)
        sys.modules.pop('narbe_runtime', None)
        self.runtime = importlib.import_module('narbe_runtime')
        self.runtime.time = self.clock
        self.device = self.runtime.Device()
        self.device.tick()
    def command(self, text):
        self.serial.input.extend((text + '\n').encode())
        self.device.tick()
        return self.serial.output.decode()
    def press(self, pin, down):
        pin.value = not down
        self.device.tick()
        self.clock.sleep(.021)
        self.device.tick()
        self.device.tick()
    def test_save_get_reset_and_acknowledgement(self):
        self.assertIn('1 OK HELLO NARBE_TRRS 1 0.2.0', self.command('1 HELLO'))
        self.assertIn('2 OK CONFIG K 43 0 M 1 0 A', self.command('2 SET K 43 0 M 1 0 A'))
        self.assertEqual(config.load(self.memory), ('K', 43, 0, 'M', 1, 0, 'A'))
        self.assertIn('3 OK CONFIG K 43 0 M 1 0 A', self.command('3 GET'))
        self.command('4 RESET')
        self.assertEqual(config.load(self.memory), config.DEFAULT)
    def test_invalid_command_keeps_saved_settings(self):
        self.assertIn('1 ERR REJECTED', self.command('1 SET M 1 8 K 40 0 A'))
        self.assertEqual(self.memory.writes, 0)
        self.assertEqual(self.device.settings, config.DEFAULT)
    def test_test_mode_suppresses_hid_and_reports_switch(self):
        self.command('1 TEST 1')
        before = len(self.keyboard.sent)
        self.press(self.board.TIP, True)
        self.press(self.board.TIP, False)
        self.assertEqual(len(self.keyboard.sent), before)
        self.assertIn('EVENT SWITCH 1 DOWN', self.serial.output.decode())
        self.assertIn('EVENT SWITCH 1 UP', self.serial.output.decode())
        self.command('2 TEST 0')
        self.press(self.board.TIP, True)
        self.assertEqual(self.keyboard.sent[-1][2], 44)
    def test_disconnect_releases_and_requires_physical_release(self):
        self.press(self.board.TIP, True)
        self.serial.connected = False
        self.device.tick()
        self.assertEqual(self.keyboard.sent[-1], bytes(8))
        self.assertFalse(self.device.armed)
        self.press(self.board.TIP, False)
        self.press(self.board.TIP, True)
        self.assertEqual(self.keyboard.sent[-1][2], 44)
    def test_test_mode_times_out_without_heartbeat(self):
        self.command('1 TEST 1')
        self.clock.sleep(6.1)
        self.device.tick()
        self.assertFalse(self.device.testing)
    def test_serial_fragmentation_oversize_and_partial_writes(self):
        self.serial.input.extend(b'1 HE')
        self.device.tick()
        self.assertFalse(self.serial.output)
        self.serial.input.extend(b'LLO\n')
        self.serial.limit = 3
        for _ in range(30):
            self.device.tick()
        self.assertIn('1 OK HELLO', self.serial.output.decode())
        self.serial.input.extend(b'2 ' + b'X' * 250 + b'\n3 GET\n')
        for _ in range(50):
            self.device.tick()
        self.assertIn('3 OK CONFIG', self.serial.output.decode())
        self.assertNotIn('2 OK', self.serial.output.decode())
    def test_mouse_and_keyboard_can_be_held_independently(self):
        self.command('1 SET K 43 2 M 1 0 A')
        self.press(self.board.TIP, True)
        self.press(self.board.RING_1, True)
        self.assertEqual(self.keyboard.sent[-1][0], 2)
        self.assertEqual(self.keyboard.sent[-1][2], 43)
        self.assertEqual(self.mouse.sent[-1][0], 1)
        self.press(self.board.TIP, False)
        self.assertEqual(self.keyboard.sent[-1], bytes(8))
        self.assertEqual(self.mouse.sent[-1][0], 1)
    def test_contact_override_uses_sleeve(self):
        self.command('1 SET K 44 0 K 40 0 S')
        self.press(self.board.SLEEVE, True)
        self.assertEqual(self.keyboard.sent[-1][2], 40)

if __name__ == '__main__':
    unittest.main(verbosity=2)
