# NARBE Trinkey Configurator entry point.
# Keep the settings port useful if startup fails; never expose a Python console.
try:
    import narbe_device
    narbe_device.run()
except Exception as error:
    import time
    import usb_cdc
    import usb_hid
    for device in usb_hid.devices:
        try:
            if device.usage_page == 1 and device.usage in (2, 6):
                device.send_report(bytes(4 if device.usage == 2 else 8))
        except Exception:
            pass
    serial = usb_cdc.data
    if serial is None:
        raise
    serial.timeout = 0
    serial.write_timeout = 0.2
    detail = repr(error).replace('\n', ' ')[:100]
    incoming = bytearray()
    while True:
        if serial.connected:
            data = serial.read(min(serial.in_waiting, 64)) if serial.in_waiting else None
            if data:
                for value in data:
                    if value == 10:
                        request = str(incoming, 'utf-8').split(' ')[0]
                        if request.isdigit() and len(request) <= 8:
                            serial.write(bytes(request + ' ERR STARTUP ' + detail + '\n', 'utf-8'))
                        incoming = bytearray()
                    elif len(incoming) < 160:
                        incoming.append(value)
        else:
            incoming = bytearray()
        time.sleep(0.01)
