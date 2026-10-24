# NARBE Trinkey Configurator 0.2.0; Adafruit TRRS Trinkey M0 / CP 10.x.
# Safe mode (reset during the yellow startup window) bypasses this file.
import storage
import usb_cdc
import usb_hid
import usb_midi

usb_midi.disable()
# A dedicated settings port. No interactive Python console in normal operation.
usb_cdc.enable(console=False, data=True)
usb_hid.enable((usb_hid.Device.KEYBOARD, usb_hid.Device.MOUSE))
storage.disable_usb_drive()
