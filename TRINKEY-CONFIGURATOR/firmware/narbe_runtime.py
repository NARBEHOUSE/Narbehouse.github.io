# NARBE TRRS runtime: bounded serial protocol, persistent bindings, held HID.
import time
import board
import digitalio
import microcontroller
import usb_cdc
import usb_hid
from narbe_settings import DEFAULT, VERSION, validate, load, save, wire, reports

class Switch:
    def __init__(self, pin):
        self.pin = pin
        self.raw = not pin.value
        self.down = False
        self.changed = time.monotonic()

    def poll(self, now):
        raw = not self.pin.value
        if raw != self.raw:
            self.raw = raw
            self.changed = now
        if raw != self.down and now - self.changed >= 0.020:
            self.down = raw
            return True
        return False

class Device:
    def __init__(self):
        self.settings = load(microcontroller.nvm)
        self.serial = usb_cdc.data
        if self.serial is None:
            raise RuntimeError('Install boot.py and unplug/replug before running.')
        self.serial.timeout = 0
        self.serial.write_timeout = 0
        self.keyboard = None
        self.mouse = None
        for device in usb_hid.devices:
            if device.usage_page == 1 and device.usage == 6:
                self.keyboard = device
            if device.usage_page == 1 and device.usage == 2:
                self.mouse = device
        if self.keyboard is None or self.mouse is None:
            raise RuntimeError('Keyboard + mouse setup requires a hard reset.')
        self.ground = digitalio.DigitalInOut(board.RING_2)
        self.ground.switch_to_output(value=False)
        self.tip = self.input(board.TIP)
        self.ring = self.input(getattr(board, 'RING_1', getattr(board, 'RING1', None)))
        self.sleeve = self.input(board.SLEEVE)
        self.led_pin = None
        try:
            import neopixel_write
            self.pixel_write = neopixel_write.neopixel_write
            self.led_pin = digitalio.DigitalInOut(board.NEOPIXEL)
            self.led_pin.switch_to_output()
        except (ImportError, AttributeError):
            pass
        self.color = None
        self.led((24, 0, 24))
        # Preserve the original profile's sleeve/ring autodetection.
        initial_s = self.sleeve.value
        initial_r = self.ring.value
        moved_s = False
        moved_r = False
        start = time.monotonic()
        while time.monotonic() - start < 1.0:
            moved_s |= self.sleeve.value != initial_s
            moved_r |= self.ring.value != initial_r
            time.sleep(0.005)
        self.auto_sleeve = moved_s if moved_s != moved_r else self.sleeve.value and not self.ring.value
        self.switches = [Switch(self.tip), Switch(self.second_pin())]
        self.testing = False
        self.last_ping = 0
        self.armed = False
        self.rx = bytearray()
        self.discard = False
        self.tx = bytearray()
        self.previous_connected = False
        self.release()

    def input(self, pin):
        result = digitalio.DigitalInOut(pin)
        result.switch_to_input(pull=digitalio.Pull.UP)
        return result

    def second_pin(self):
        mode = self.settings[6]
        return self.sleeve if mode == 'S' or (mode == 'A' and self.auto_sleeve) else self.ring

    def led(self, rgb):
        if self.led_pin is not None and rgb != self.color:
            self.pixel_write(self.led_pin, bytes((rgb[1], rgb[0], rgb[2])))
            self.color = rgb

    def release(self):
        self.keyboard.send_report(bytes(8))
        self.mouse.send_report(bytes(4))
        self.armed = False

    def queue(self, line):
        packet = bytes(line + '\n', 'utf-8')
        if len(self.tx) + len(packet) <= 1024:
            self.tx.extend(packet)
        else:
            # Never keep the user trapped in test mode behind a stalled client.
            self.testing = False
            self.release()
            self.tx = bytearray()

    def command(self, line):
        parts = line.split()
        if len(parts) < 2 or not parts[0].isdigit() or len(parts[0]) > 8:
            return
        request, command = parts[:2]
        try:
            if command == 'HELLO' and len(parts) == 2:
                result = 'HELLO NARBE_TRRS 1 ' + VERSION + ' ' + ''.join('%02x' % value for value in microcontroller.cpu.uid)
            elif command == 'GET' and len(parts) == 2:
                result = 'CONFIG ' + wire(self.settings)
            elif command in ('SET', 'RESET'):
                if command == 'RESET' and len(parts) != 2:
                    raise ValueError('FORMAT')
                proposed = DEFAULT if command == 'RESET' else validate(parts[2:])
                self.release()
                # Acknowledge only after the persistent write has been read back.
                self.settings = save(microcontroller.nvm, proposed)
                self.switches[1] = Switch(self.second_pin())
                result = 'CONFIG ' + wire(self.settings)
            elif command == 'TEST' and len(parts) == 3 and parts[2] in ('0', '1'):
                self.release()
                self.testing = parts[2] == '1'
                self.last_ping = time.monotonic()
                result = 'TEST ' + parts[2]
            elif command == 'PING' and len(parts) == 2:
                self.last_ping = time.monotonic()
                result = 'PONG ' + ('1' if self.testing else '0')
            else:
                raise ValueError('COMMAND')
            self.queue(request + ' OK ' + result)
        except (ValueError, OSError, RuntimeError):
            self.queue(request + ' ERR REJECTED')

    def serial_tick(self, now):
        connected = self.serial.connected
        if not connected:
            if self.previous_connected:
                self.testing = False
                self.release()
            self.rx = bytearray()
            self.tx = bytearray()
            self.discard = False
        else:
            incoming = self.serial.read(min(self.serial.in_waiting, 128)) if self.serial.in_waiting else None
            if incoming:
                for value in incoming:
                    if value == 10:
                        if not self.discard:
                            try:
                                self.command(str(self.rx, 'utf-8').strip())
                            except UnicodeError:
                                pass
                        self.rx = bytearray()
                        self.discard = False
                    elif value != 13:
                        if len(self.rx) < 160 and not self.discard:
                            self.rx.append(value)
                        else:
                            self.discard = True
            if self.tx:
                try:
                    count = self.serial.write(self.tx) or 0
                    if count:
                        self.tx = self.tx[count:]
                except OSError:
                    self.tx = bytearray()
                    self.testing = False
                    self.release()
        self.previous_connected = connected
        if self.testing and now - self.last_ping > 6.0:
            self.testing = False
            self.release()
            self.queue('EVENT TEST_END')

    def tick(self):
        now = time.monotonic()
        self.serial_tick(now)
        changed = False
        for index, switch in enumerate(self.switches):
            if switch.poll(now):
                changed = True
                if self.testing:
                    self.queue('EVENT SWITCH ' + str(index + 1) + (' DOWN' if switch.down else ' UP'))
        pressed = [switch.down for switch in self.switches]
        # Re-arm only after BOTH physical inputs are released, including debounce.
        if not self.armed and not any(pressed) and all(s.pin.value for s in self.switches):
            self.armed = True
        if changed and self.armed and not self.testing:
            keyboard, mouse = reports(self.settings, pressed)
            self.keyboard.send_report(keyboard)
            self.mouse.send_report(mouse)
        self.led((28, 0, 0) if all(pressed) else (0, 0, 36) if pressed[0] else (28, 28, 0) if pressed[1] else (0, 20, 24) if self.testing else (0, 24, 0))

def run():
    device = Device()
    try:
        while True:
            device.tick()
            time.sleep(0.005)
    finally:
        device.release()
